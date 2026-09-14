import ExpoModulesCore

public final class JamyeFilePutModule: Module {
  // put/cancel and delegate completions share the main queue. File bytes are read
  // by URLSession off-thread, not by Swift Data or the JavaScript runtime.
  private var uploads: [String: FilePutUpload] = [:]

  public func definition() -> ModuleDefinition {
    Name("JamyeFilePut")

    AsyncFunction("putAsync") { (id: String, url: String, uri: String, contentType: String, byteSize: Int, promise: Promise) in
      guard self.uploads[id] == nil,
        let cache = self.appContext?.config.cacheDirectory,
        let destination = Self.destination(url),
        let file = Self.stagedFile(uri, cache: cache, byteSize: byteSize),
        contentType.range(of: "^[a-z0-9.+-]+/[a-z0-9.+-]+$", options: .regularExpression) != nil
      else {
        promise.reject("ERR_FILE_PUT_INVALID_FILE", "invalid_file")
        return
      }
      let upload = FilePutUpload(promise: promise) { [weak self] in
        self?.uploads.removeValue(forKey: id)
      }
      self.uploads[id] = upload
      upload.start(url: destination, file: file, contentType: contentType)
    }.runOnQueue(.main)

    AsyncFunction("cancelAsync") { (id: String) in
      self.uploads[id]?.cancel()
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { [self] in
        for upload in Array(uploads.values) { upload.cancel() }
      }
    }
  }

  private static func destination(_ raw: String) -> URL? {
    guard let url = URL(string: raw), url.user == nil, url.password == nil,
      url.fragment == nil, url.host != nil else { return nil }
    if url.scheme == "https" { return url }
    #if DEBUG
    // Synthetic emulator smoke only; no cleartext destinations in release builds.
    if url.scheme == "http", url.host == "127.0.0.1" { return url }
    #endif
    return nil
  }

  private static func stagedFile(_ raw: String, cache: URL, byteSize: Int) -> URL? {
    guard byteSize > 0, byteSize <= 50 * 1024 * 1024,
      let file = URL(string: raw), file.isFileURL,
      file.host == nil || file.host == "", file.query == nil, file.fragment == nil
    else { return nil }
    let root = cache.resolvingSymlinksInPath().appendingPathComponent("media-staging", isDirectory: true)
    let canonical = file.resolvingSymlinksInPath().standardizedFileURL
    guard canonical.deletingLastPathComponent().path == root.path,
      let values = try? file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]),
      values.isRegularFile == true, values.isSymbolicLink != true, values.fileSize == byteSize
    else { return nil }
    return canonical
  }
}

private final class FilePutUpload: NSObject, URLSessionDataDelegate {
  private let promise: Promise
  private let onFinish: () -> Void
  private var session: URLSession?
  private var task: URLSessionUploadTask?
  private var finished = false

  init(promise: Promise, onFinish: @escaping () -> Void) {
    self.promise = promise
    self.onFinish = onFinish
  }

  func start(url: URL, file: URL, contentType: String) {
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.httpCookieStorage = nil
    config.urlCredentialStorage = nil
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 120
    config.timeoutIntervalForResource = 120
    let session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
    self.session = session
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.httpShouldHandleCookies = false
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    task = session.uploadTask(with: request, fromFile: file)
    task?.resume()
  }

  func cancel() { finish(reason: "cancelled") }

  private func finish(status: Int? = nil, reason: String = "network") {
    guard !finished else { return }
    finished = true
    // No response body is needed; cancel at headers rather than buffering it.
    session?.invalidateAndCancel()
    task = nil
    session = nil
    onFinish()
    if let status {
      promise.resolve(["status": status])
    } else {
      promise.reject("ERR_FILE_PUT_\(reason.uppercased())", reason)
    }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
    didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    completionHandler(.cancel)
    finish(status: (response as? HTTPURLResponse)?.statusCode)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    finish(status: response.statusCode)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      completionHandler(.performDefaultHandling, nil)
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      finish()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    finish()
  }
}
