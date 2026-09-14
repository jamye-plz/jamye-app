Pod::Spec.new do |s|
  s.name = 'JamyeFilePut'
  s.version = '1.0.0'
  s.summary = 'Foreground, credential-free file PUT for Jamye media'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Jamye'
  s.homepage = 'https://github.com/jamye-plz/jamye-app'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/jamye-plz/jamye-app.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
