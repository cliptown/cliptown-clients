// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "ClipTownClient", platforms: [.macOS(.v12), .iOS(.v15)], products: [.library(name: "ClipTownClient", targets: ["ClipTownClient"])], targets: [.target(name: "ClipTownClient")])
