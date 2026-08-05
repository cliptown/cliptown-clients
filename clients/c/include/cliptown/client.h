#ifndef CLIPTOWN_CLIENT_H
#define CLIPTOWN_CLIENT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct cliptown_client {
  const char *base_url;
  const char *access_token;
} cliptown_client;

int cliptown_client_endpoint(const cliptown_client *client, const char *path,
                             char *output, size_t output_size);

#ifdef __cplusplus
}
#endif

#endif
