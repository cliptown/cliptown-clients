<?php
declare(strict_types=1);
namespace ClipTown;
use RuntimeException;

final class HttpException extends RuntimeException {
    public function __construct(public readonly int $status, public readonly string $responseBody) {
        parent::__construct('ClipTown HTTP ' . $status . ': ' . substr($responseBody, 0, 512));
    }
}

final class Client {
    public function __construct(private readonly string $baseUrl, private readonly ?string $token = null, private readonly int $timeoutSeconds = 30) {
        $parts = parse_url($baseUrl);
        if (!is_array($parts) || !in_array($parts['scheme'] ?? '', ['http','https'], true) || !isset($parts['host']) || isset($parts['user'])) {
            throw new RuntimeException('baseUrl must be credential-free absolute HTTP(S)');
        }
    }

    public function request(string $method, string $path, mixed $body = null): mixed {
        $ch = curl_init(rtrim($this->baseUrl, '/') . '/' . ltrim($path, '/'));
        if ($ch === false) throw new RuntimeException('curl initialization failed');
        $headers = ['Accept: application/json'];
        if ($this->token) $headers[] = 'Authorization: Bearer ' . $this->token;
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => strtoupper($method), CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => $this->timeoutSeconds, CURLOPT_HTTPHEADER => $headers]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
        $response = curl_exec($ch);
        if (!is_string($response)) { $message = curl_error($ch); curl_close($ch); throw new RuntimeException($message); }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);
        if ($status < 200 || $status >= 300) throw new HttpException($status, $response);
        if ($response === '') return null;
        return str_contains($contentType, 'json') ? json_decode($response, true, 512, JSON_THROW_ON_ERROR) : $response;
    }
}
