defmodule ClipTown.Client do
  @moduledoc "ClipTown HTTP transport."
  defstruct [:base_url, :token, timeout: 30_000]

  def new(base_url, opts \\ []) do
    uri = URI.parse(base_url)
    unless uri.scheme in ["http", "https"] and is_binary(uri.host) and is_nil(uri.userinfo), do: raise(ArgumentError, "base_url must be credential-free absolute HTTP(S)")
    %__MODULE__{base_url: String.trim_trailing(base_url, "/"), token: opts[:token], timeout: opts[:timeout] || 30_000}
  end

  def request(client, method, path, body \\ nil) do
    :inets.start(); :ssl.start()
    url = String.to_charlist(client.base_url <> "/" <> String.trim_leading(path, "/"))
    headers = [{'accept', 'application/json'}] |> authorize(client.token)
    request = if is_nil(body), do: {url, headers}, else: {url, headers, 'application/json', Jason.encode!(body)}
    case :httpc.request(method, request, [timeout: client.timeout, autoredirect: false], body_format: :binary) do
      {:ok, {{_, status, _}, response_headers, response}} when status in 200..299 -> {:ok, status, response_headers, response}
      {:ok, {{_, status, _}, _, response}} -> {:error, status, response}
      {:error, reason} -> {:error, reason}
    end
  end

  defp authorize(headers, nil), do: headers
  defp authorize(headers, ""), do: headers
  defp authorize(headers, token), do: [{'authorization', String.to_charlist("Bearer " <> token)} | headers]
end
