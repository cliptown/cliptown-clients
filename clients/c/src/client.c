#include "cliptown/client.h"

#include <stdio.h>
#include <string.h>

int cliptown_client_endpoint(const cliptown_client *client, const char *path,
                             char *output, size_t output_size) {
  if (client == NULL || client->base_url == NULL || path == NULL ||
      output == NULL || output_size == 0) {
    return -1;
  }
  const size_t base_len = strlen(client->base_url);
  if (base_len == 0) {
    return -1;
  }
  const char *separator = client->base_url[base_len - 1] == '/' ? "" : "/";
  const char *trimmed = path[0] == '/' ? path + 1 : path;
  const int written = snprintf(output, output_size, "%s%s%s", client->base_url,
                               separator, trimmed);
  return (written < 0 || (size_t)written >= output_size) ? -1 : written;
}
