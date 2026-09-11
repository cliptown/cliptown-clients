// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "CliptownClient",
  platforms: [.iOS(.v15), .macOS(.v12)],
  products: [.library(name: "CliptownClient", targets: ["CliptownClient"])],
  targets: [.target(name: "CliptownClient")]
)
