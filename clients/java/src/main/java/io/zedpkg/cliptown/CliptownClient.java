package io.zedpkg.cliptown;
import java.net.URI;
public record CliptownClient(URI baseUri, String bearerToken) {}
