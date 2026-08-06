defmodule ClipTown.Client.MixProject do
  use Mix.Project
  def project, do: [app: :cliptown_client, version: "0.1.0", elixir: "~> 1.16", deps: [{:jason, "~> 1.4"}], description: "ClipTown HTTP client"]
  def application, do: [extra_applications: [:logger, :inets, :ssl]]
end
