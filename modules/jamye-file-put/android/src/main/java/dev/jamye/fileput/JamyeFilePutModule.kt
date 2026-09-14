package dev.jamye.fileput

import android.net.Uri
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Callback
import okhttp3.CookieJar
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okio.BufferedSink

class JamyeFilePutModule : Module() {
  private val uploads = ConcurrentHashMap<String, Call>()
  // Never use React Native/Expo's shared cookie-aware client or interceptors.
  private val client = OkHttpClient.Builder()
    .cookieJar(CookieJar.NO_COOKIES)
    .authenticator(Authenticator.NONE)
    .proxyAuthenticator(Authenticator.NONE)
    .followRedirects(false)
    .followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .cache(null)
    .callTimeout(120, TimeUnit.SECONDS)
    .build()

  override fun definition() = ModuleDefinition {
    Name("JamyeFilePut")

    // Same ordered queue: an immediate JS abort cannot overtake registration.
    AsyncFunction("putAsync") { id: String, url: String, uri: String, contentType: String, byteSize: Long, promise: Promise ->
      try {
        val file = stagedFile(uri, byteSize)
        val target = url.toHttpUrlOrNull()
        require(target != null && target.username.isEmpty() && target.password.isEmpty() && target.fragment == null)
        val debugLoopback = BuildConfig.DEBUG && target.scheme == "http" &&
          target.host in setOf("127.0.0.1", "10.0.2.2")
        require(target.isHttps || debugLoopback)
        require(contentType.matches(Regex("^[a-z0-9.+-]+/[a-z0-9.+-]+$")))
        require(!uploads.containsKey(id))
        val request = Request.Builder().url(target)
          .header("Content-Type", contentType)
          .put(FilePutBody(file, byteSize, contentType)).build()
        val call = client.newCall(request)
        uploads[id] = call
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, error: IOException) {
            uploads.remove(id, call)
            val reason = if (call.isCanceled()) "cancelled" else "network"
            promise.reject("ERR_FILE_PUT_${reason.uppercase()}", reason, null)
          }

          override fun onResponse(call: Call, response: Response) {
            response.use {
              uploads.remove(id, call)
              if (call.isCanceled()) {
                promise.reject("ERR_FILE_PUT_CANCELLED", "cancelled", null)
              } else {
                promise.resolve(mapOf("status" to response.code))
              }
            }
          }
        })
      } catch (_: Exception) {
        promise.reject("ERR_FILE_PUT_INVALID_FILE", "invalid_file", null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelAsync") { id: String ->
      uploads[id]?.cancel()
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      uploads.values.forEach { it.cancel() }
      uploads.clear()
      client.connectionPool.evictAll()
    }
  }

  private fun stagedFile(raw: String, byteSize: Long): File {
    require(byteSize in 1..(50L * 1024 * 1024))
    val uri = Uri.parse(raw)
    require(uri.scheme == "file" && uri.host.isNullOrEmpty() && uri.query == null && uri.fragment == null)
    val original = File(requireNotNull(uri.path))
    val root = File(appContext.cacheDirectory.canonicalFile, "media-staging")
    val file = original.canonicalFile
    // /data/user/0 and /data/data are OS aliases. Compare canonical containment,
    // and lstat the leaf to reject symlinks without rejecting legitimate aliases.
    require(file.parentFile == root && OsConstants.S_ISREG(Os.lstat(original.path).st_mode))
    require(file.isFile && file.length() == byteSize)
    return file
  }
}

/** Fixed 8 KiB working buffer; no ByteArray(file.length), readBytes or JS body.
 * A file that grows/shrinks after validation fails instead of escaping the bound. */
private class FilePutBody(
  private val file: File,
  private val byteSize: Long,
  private val mime: String
) : RequestBody() {
  override fun contentType() = mime.toMediaType()
  override fun contentLength() = byteSize
  override fun isOneShot() = true

  override fun writeTo(sink: BufferedSink) {
    file.inputStream().use { input ->
      val buffer = ByteArray(8192)
      var total = 0L
      while (true) {
        val count = input.read(buffer)
        if (count == -1) break
        total += count
        if (total > byteSize) throw IOException("invalid_file")
        sink.write(buffer, 0, count)
      }
      if (total != byteSize) throw IOException("invalid_file")
    }
  }
}
