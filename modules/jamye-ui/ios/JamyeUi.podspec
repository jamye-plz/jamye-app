Pod::Spec.new do |s|
  s.name = 'JamyeUi'
  s.version = '1.0.0'
  s.summary = 'Local expo-ui SwiftUI extensions for Jamye (circular avatar view)'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Jamye'
  s.homepage = 'https://github.com/jamye-plz/jamye-app'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/jamye-plz/jamye-app.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'
  s.source_files = '**/*.swift'
end
