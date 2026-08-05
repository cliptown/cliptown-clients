package app.cliptown.client

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

class ClipTownHttpException(val status: Int, val responseBody: ByteArray) : RuntimeException("ClipTown HTTP $status")

class ClipTownClient(baseUrl: String, private val token: String? = null) {
  private val base = URI(baseUrl.trimEnd('/') + "/").also { require(it.scheme in setOf("http", "https") && it.host != null && it.userInfo == null) }
  private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10)).build()
  fun request(method: String, path: String, jsonBody: ByteArray? = null): ByteArray {
    val builder = HttpRequest.newBuilder(base.resolve(path.trimStart('/'))).timeout(Duration.ofSeconds(30)).header("Accept", "application/json")
    if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
    if (jsonBody != null) builder.header("Content-Type", "application/json")
    builder.method(method.uppercase(), jsonBody?.let(HttpRequest.BodyPublishers::ofByteArray) ?: HttpRequest.BodyPublishers.noBody())
    val response = http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
    if (response.statusCode() !in 200..299) throw ClipTownHttpException(response.statusCode(), response.body())
    return response.body()
  }
}
