// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LifeOSIsland",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "LifeOSIsland", targets: ["LifeOSIsland"]),
    ],
    targets: [
        .executableTarget(
            name: "LifeOSIsland",
            resources: [.process("Resources")]
        ),
    ]
)
