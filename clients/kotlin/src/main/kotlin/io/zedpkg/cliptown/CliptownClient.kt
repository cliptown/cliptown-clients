package io.zedpkg.cliptown
import java.net.URI
data class CliptownClient(val baseUri: URI, val bearerToken: String? = null)
