package app.cliptown.client;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class ClipTownClient {
  public static final class HttpException extends IOException {
    public final int status; public final byte[] responseBody;
    public HttpException(int status, byte[] body) { super("ClipTown HTTP " + status); this.status = status; this.responseBody = body; }
  }
  private final URI base; private final String token; private final Duration timeout; private final HttpClient http;
  public ClipTownClient(String baseUrl, String token) {
    this.base = URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
    if (!("http".equals(base.getScheme()) || "https".equals(base.getScheme())) || base.getHost() == null || base.getUserInfo() != null) throw new IllegalArgumentException("baseUrl must be credential-free absolute HTTP(S)");
    this.token = token; this.timeout = Duration.ofSeconds(30);
    this.http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10)).build();
  }
  public byte[] request(String method, String path, byte[] jsonBody) throws IOException, InterruptedException {
    HttpRequest.Builder builder = HttpRequest.newBuilder(base.resolve(path.replaceFirst("^/+", ""))).timeout(timeout).header("Accept", "application/json");
    if (token != null && !token.isBlank()) builder.header("Authorization", "Bearer " + token);
    if (jsonBody != null) builder.header("Content-Type", "application/json");
    builder.method(method.toUpperCase(), jsonBody == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(jsonBody));
    HttpResponse<byte[]> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    if (response.statusCode() < 200 || response.statusCode() >= 300) throw new HttpException(response.statusCode(), response.body());
    return response.body();
  }
}
