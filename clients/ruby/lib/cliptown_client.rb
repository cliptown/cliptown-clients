# frozen_string_literal: true
require "json"
require "net/http"
require "uri"

module ClipTown
  class Error < StandardError
    attr_reader :status, :body
    def initialize(status, body)
      @status, @body = status, body
      super("ClipTown HTTP #{status}: #{body.to_s.byteslice(0, 512)}")
    end
  end

  class Client
    def initialize(base_url:, token: nil, open_timeout: 10, read_timeout: 30)
      @base = URI(base_url)
      raise ArgumentError, "base_url must be credential-free absolute HTTP(S)" unless %w[http https].include?(@base.scheme) && @base.host && !@base.user
      @token, @open_timeout, @read_timeout = token, open_timeout, read_timeout
    end

    def request(method, path, body: nil)
      uri = @base + path.sub(%r{\A/+}, "")
      req = Net::HTTP.const_get(method.to_s.capitalize).new(uri)
      req["Accept"] = "application/json"
      req["Authorization"] = "Bearer #{@token}" if @token && !@token.empty?
      if body
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl, http.open_timeout, http.read_timeout = uri.scheme == "https", @open_timeout, @read_timeout
      response = http.request(req)
      raise Error.new(response.code.to_i, response.body.to_s) unless response.code.to_i.between?(200, 299)
      return nil if response.body.to_s.empty?
      response["Content-Type"].to_s.include?("json") ? JSON.parse(response.body) : response.body.b
    end
  end
end
