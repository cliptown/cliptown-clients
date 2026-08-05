import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct ClipTownHTTPError: Error { public let status: Int; public let body: Data }

public final class ClipTownClient {
    private let baseURL: URL; private let token: String?; private let session: URLSession
    public init(baseURL: URL, token: String? = nil, session: URLSession = .shared) throws {
        guard ["http", "https"].contains(baseURL.scheme?.lowercased() ?? ""), baseURL.host != nil, baseURL.user == nil else { throw URLError(.badURL) }
        self.baseURL = baseURL; self.token = token; self.session = session
    }
    public func request(method: String, path: String, jsonBody: Data? = nil) async throws -> Data {
        guard let url = URL(string: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")), relativeTo: baseURL.appendingPathComponent("")) else { throw URLError(.badURL) }
        var request = URLRequest(url: url); request.httpMethod = method.uppercased(); request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let jsonBody { request.httpBody = jsonBody; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else { throw ClipTownHTTPError(status: http.statusCode, body: data) }
        return data
    }
}
