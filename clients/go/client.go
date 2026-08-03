// Package cliptownclient is the official Go SDK for the ClipTown HTTP API.
//
// MemeBank interoperability is API-first. The SDK never probes whether either
// mobile app is installed, never invokes a deep link or local IPC endpoint, and
// never uses clipboard monitoring as the product-to-product transport.
package cliptownclient

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	ContractVersion          = 1
	MaximumInlineCipherBytes = 16 * 1024 * 1024
	maximumResponseBytes     = 24 * 1024 * 1024
	maximumErrorBytes        = 64 * 1024
	maximumBearerBytes       = 16 * 1024
	defaultTimeout           = 15 * time.Second
)

var (
	ErrInvalidConfiguration = errors.New("cliptown: invalid configuration")
	ErrInvalidRequest       = errors.New("cliptown: invalid request")
	ErrUnauthorized         = errors.New("cliptown: unauthorized")
	ErrForbidden            = errors.New("cliptown: forbidden")
	ErrNotFound             = errors.New("cliptown: not found")
	ErrConflict             = errors.New("cliptown: conflict")
	ErrPayloadTooLarge      = errors.New("cliptown: payload too large")
	ErrIncompatibleContract = errors.New("cliptown: incompatible contract")
	ErrRateLimited          = errors.New("cliptown: rate limited")
	ErrUnavailable          = errors.New("cliptown: unavailable")
	ErrUnexpectedStatus     = errors.New("cliptown: unexpected status")
)

var (
	portableIdentifier = regexp.MustCompile(`^[A-Za-z0-9._:-]+$`)
	canonicalUUID      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type TransferDirection string

const (
	DirectionMemeBankToClipTown TransferDirection = "memebank_to_cliptown"
	DirectionClipTownToMemeBank TransferDirection = "cliptown_to_memebank"
)

type TransferState string

const (
	TransferPending      TransferState = "pending"
	TransferAcknowledged TransferState = "acknowledged"
	TransferIgnored      TransferState = "ignored"
	TransferRejected     TransferState = "rejected"
	TransferExpired      TransferState = "expired"
	TransferCancelled    TransferState = "cancelled"
)

type AcknowledgementDisposition string

const (
	DispositionAcknowledged AcknowledgementDisposition = "acknowledged"
	DispositionIgnored      AcknowledgementDisposition = "ignored"
	DispositionRejected     AcknowledgementDisposition = "rejected"
)

type CipherEnvelope struct {
	Algorithm          string  `json:"algorithm"`
	Nonce              string  `json:"nonce"`
	Ciphertext         string  `json:"ciphertext"`
	AssociatedDataHash *string `json:"associated_data_hash,omitempty"`
	KeyID              string  `json:"key_id"`
}

type CreateTransferRequest struct {
	ContractVersion   int               `json:"contract_version"`
	Direction         TransferDirection `json:"direction"`
	SourceItemID      string            `json:"source_item_id"`
	MediaType         string            `json:"media_type"`
	ContentSHA256     string            `json:"content_sha256"`
	ContentLength     int64             `json:"content_length"`
	Payload           CipherEnvelope    `json:"payload"`
	EncryptedMetadata *CipherEnvelope   `json:"encrypted_metadata,omitempty"`
	ExpiresAt         time.Time         `json:"expires_at"`
}

type Transfer struct {
	CreateTransferRequest
	TransferID     string        `json:"transfer_id"`
	State          TransferState `json:"state"`
	CreatedAt      time.Time     `json:"created_at"`
	UpdatedAt      time.Time     `json:"updated_at"`
	AcknowledgedAt *time.Time    `json:"acknowledged_at,omitempty"`
}

type TransferPage struct {
	Items      []Transfer `json:"items"`
	NextCursor *string    `json:"next_cursor"`
}

type AcknowledgeTransferRequest struct {
	ContractVersion int                        `json:"contract_version"`
	Disposition     AcknowledgementDisposition `json:"disposition"`
	ClientReceiptID string                     `json:"client_receipt_id"`
}

type ListTransfersOptions struct {
	Cursor    string
	Limit     int
	Direction TransferDirection
	State     TransferState
}

// TokenProvider returns a short-lived shared-auth delegated token. For the
// MemeBank integration it must be audience-bound to cliptown-api and carry an
// exact cliptown:memebank:* scope.
type TokenProvider interface {
	AccessToken(context.Context) (string, error)
}

type TokenProviderFunc func(context.Context) (string, error)

func (provider TokenProviderFunc) AccessToken(ctx context.Context) (string, error) {
	return provider(ctx)
}

type Client struct {
	baseURL       *url.URL
	httpClient    *http.Client
	tokenProvider TokenProvider
	userAgent     string
}

type Option func(*Client) error

func WithHTTPClient(httpClient *http.Client) Option {
	return func(client *Client) error {
		if httpClient == nil {
			return ErrInvalidConfiguration
		}
		client.httpClient = hardenedHTTPClient(httpClient)
		return nil
	}
}

func WithUserAgent(userAgent string) Option {
	return func(client *Client) error {
		userAgent = strings.TrimSpace(userAgent)
		if userAgent == "" || len(userAgent) > 256 || strings.ContainsAny(userAgent, "\r\n") {
			return ErrInvalidConfiguration
		}
		client.userAgent = userAgent
		return nil
	}
}

func New(baseURL string, tokenProvider TokenProvider, options ...Option) (*Client, error) {
	parsed, err := parseBaseURL(baseURL)
	if err != nil || tokenProvider == nil {
		return nil, ErrInvalidConfiguration
	}
	client := &Client{
		baseURL:       parsed,
		httpClient:    hardenedHTTPClient(nil),
		tokenProvider: tokenProvider,
		userAgent:     "cliptown-go/0.1",
	}
	for _, option := range options {
		if option == nil {
			return nil, ErrInvalidConfiguration
		}
		if err := option(client); err != nil {
			return nil, err
		}
	}
	return client, nil
}

func (client *Client) CreateMemeBankTransfer(
	ctx context.Context,
	idempotencyKey string,
	request CreateTransferRequest,
) (*Transfer, error) {
	if !validIdempotencyKey(idempotencyKey) || request.validate() != nil {
		return nil, ErrInvalidRequest
	}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	httpRequest, err := client.authorizedRequest(
		ctx,
		http.MethodPost,
		"/v1/integrations/memebank/transfers",
		nil,
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", idempotencyKey)
	var transfer Transfer
	if err := client.doJSON(httpRequest, &transfer); err != nil {
		return nil, err
	}
	if err := transfer.validateServerValue(); err != nil {
		return nil, err
	}
	return &transfer, nil
}

func (client *Client) ListMemeBankTransfers(
	ctx context.Context,
	options ListTransfersOptions,
) (*TransferPage, error) {
	query, err := options.query()
	if err != nil {
		return nil, err
	}
	httpRequest, err := client.authorizedRequest(
		ctx,
		http.MethodGet,
		"/v1/integrations/memebank/transfers",
		query,
		nil,
	)
	if err != nil {
		return nil, err
	}
	var page TransferPage
	if err := client.doJSON(httpRequest, &page); err != nil {
		return nil, err
	}
	if len(page.Items) > 100 || (page.NextCursor != nil && !validCursor(*page.NextCursor)) {
		return nil, ErrIncompatibleContract
	}
	for index := range page.Items {
		if err := page.Items[index].validateServerValue(); err != nil {
			return nil, err
		}
	}
	return &page, nil
}

func (client *Client) GetMemeBankTransfer(ctx context.Context, transferID string) (*Transfer, error) {
	if !validUUID(transferID) {
		return nil, ErrInvalidRequest
	}
	httpRequest, err := client.authorizedRequest(
		ctx,
		http.MethodGet,
		"/v1/integrations/memebank/transfers/"+url.PathEscape(transferID),
		nil,
		nil,
	)
	if err != nil {
		return nil, err
	}
	var transfer Transfer
	if err := client.doJSON(httpRequest, &transfer); err != nil {
		return nil, err
	}
	if err := transfer.validateServerValue(); err != nil {
		return nil, err
	}
	return &transfer, nil
}

func (client *Client) AcknowledgeMemeBankTransfer(
	ctx context.Context,
	transferID string,
	idempotencyKey string,
	request AcknowledgeTransferRequest,
) (*Transfer, error) {
	if !validUUID(transferID) || !validIdempotencyKey(idempotencyKey) || request.validate() != nil {
		return nil, ErrInvalidRequest
	}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	httpRequest, err := client.authorizedRequest(
		ctx,
		http.MethodPost,
		"/v1/integrations/memebank/transfers/"+url.PathEscape(transferID)+"/ack",
		nil,
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", idempotencyKey)
	var transfer Transfer
	if err := client.doJSON(httpRequest, &transfer); err != nil {
		return nil, err
	}
	if err := transfer.validateServerValue(); err != nil {
		return nil, err
	}
	return &transfer, nil
}

func (client *Client) CancelMemeBankTransfer(ctx context.Context, transferID string) error {
	if !validUUID(transferID) {
		return ErrInvalidRequest
	}
	httpRequest, err := client.authorizedRequest(
		ctx,
		http.MethodDelete,
		"/v1/integrations/memebank/transfers/"+url.PathEscape(transferID),
		nil,
		nil,
	)
	if err != nil {
		return err
	}
	return client.doJSON(httpRequest, nil)
}

func (client *Client) authorizedRequest(
	ctx context.Context,
	method string,
	path string,
	query url.Values,
	body io.Reader,
) (*http.Request, error) {
	if client == nil || client.baseURL == nil || client.httpClient == nil || client.tokenProvider == nil {
		return nil, ErrInvalidConfiguration
	}
	token, err := client.tokenProvider.AccessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("cliptown token provider: %w", err)
	}
	if !validBearer(token) {
		return nil, ErrUnauthorized
	}
	endpoint := *client.baseURL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + path
	endpoint.RawQuery = query.Encode()
	httpRequest, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Authorization", "Bearer "+token)
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("User-Agent", client.userAgent)
	return httpRequest, nil
}

func (client *Client) doJSON(request *http.Request, output any) error {
	response, err := client.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return decodeStatusError(response)
	}
	if output == nil {
		limited := &io.LimitedReader{R: response.Body, N: maximumErrorBytes + 1}
		_, err := io.Copy(io.Discard, limited)
		if err != nil {
			return err
		}
		if limited.N <= 0 {
			return ErrPayloadTooLarge
		}
		return nil
	}

	limited := &io.LimitedReader{R: response.Body, N: maximumResponseBytes + 1}
	decoder := json.NewDecoder(limited)
	if err := decoder.Decode(output); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return ErrIncompatibleContract
		}
		return err
	}
	if limited.N <= 0 {
		return ErrPayloadTooLarge
	}
	return nil
}

type StatusError struct {
	StatusCode int
	Code       string
}

func (errorValue *StatusError) Error() string {
	if errorValue.Code == "" {
		return fmt.Sprintf("cliptown: HTTP %d", errorValue.StatusCode)
	}
	return fmt.Sprintf("cliptown: HTTP %d (%s)", errorValue.StatusCode, errorValue.Code)
}

func (errorValue *StatusError) Unwrap() error {
	switch errorValue.StatusCode {
	case http.StatusUnauthorized:
		return ErrUnauthorized
	case http.StatusForbidden:
		return ErrForbidden
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusConflict:
		return ErrConflict
	case http.StatusRequestEntityTooLarge:
		return ErrPayloadTooLarge
	case http.StatusUnprocessableEntity:
		return ErrIncompatibleContract
	case http.StatusTooManyRequests:
		return ErrRateLimited
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return ErrUnavailable
	default:
		return ErrUnexpectedStatus
	}
}

func decodeStatusError(response *http.Response) error {
	limited := &io.LimitedReader{R: response.Body, N: maximumErrorBytes + 1}
	var payload struct {
		Error string `json:"error"`
		Code  string `json:"code"`
	}
	_ = json.NewDecoder(limited).Decode(&payload)
	code := strings.TrimSpace(payload.Code)
	if code == "" {
		code = strings.TrimSpace(payload.Error)
	}
	if limited.N <= 0 || len(code) > 128 || strings.ContainsAny(code, "\r\n") {
		code = ""
	}
	return &StatusError{StatusCode: response.StatusCode, Code: code}
}

func (request CreateTransferRequest) validate() error {
	if request.ContractVersion != ContractVersion ||
		!validDirection(request.Direction) ||
		!validPortableIdentifier(request.SourceItemID, 128) ||
		!validMediaType(request.MediaType) ||
		!validSHA256(request.ContentSHA256) ||
		request.ContentLength < 0 ||
		request.ContentLength > MaximumInlineCipherBytes ||
		request.ExpiresAt.IsZero() ||
		request.Payload.validate() != nil {
		return ErrInvalidRequest
	}
	if request.EncryptedMetadata != nil && request.EncryptedMetadata.validate() != nil {
		return ErrInvalidRequest
	}
	return nil
}

func (envelope CipherEnvelope) validate() error {
	if envelope.Algorithm != "xchacha20poly1305-v1" && envelope.Algorithm != "aes-256-gcm-v1" {
		return ErrInvalidRequest
	}
	if !validPortableIdentifier(envelope.KeyID, 128) || !validBase64(envelope.Nonce, 128) {
		return ErrInvalidRequest
	}
	if len(envelope.Ciphertext) == 0 || len(envelope.Ciphertext) > 22369624 {
		return ErrInvalidRequest
	}
	decodedLength, ok := decodedBase64Length(envelope.Ciphertext)
	if !ok || decodedLength > MaximumInlineCipherBytes {
		return ErrInvalidRequest
	}
	if envelope.AssociatedDataHash != nil && !validBase64(*envelope.AssociatedDataHash, 128) {
		return ErrInvalidRequest
	}
	return nil
}

func (request AcknowledgeTransferRequest) validate() error {
	if request.ContractVersion != ContractVersion ||
		!validPortableIdentifier(request.ClientReceiptID, 128) ||
		(request.Disposition != DispositionAcknowledged &&
			request.Disposition != DispositionIgnored &&
			request.Disposition != DispositionRejected) {
		return ErrInvalidRequest
	}
	return nil
}

func (transfer Transfer) validateServerValue() error {
	if transfer.ContractVersion != ContractVersion {
		return ErrIncompatibleContract
	}
	if !validUUID(transfer.TransferID) ||
		!validTransferState(transfer.State) ||
		transfer.CreatedAt.IsZero() ||
		transfer.UpdatedAt.IsZero() ||
		transfer.CreateTransferRequest.validate() != nil {
		return ErrIncompatibleContract
	}
	return nil
}

func (options ListTransfersOptions) query() (url.Values, error) {
	values := make(url.Values)
	if options.Cursor != "" {
		if !validCursor(options.Cursor) {
			return nil, ErrInvalidRequest
		}
		values.Set("cursor", options.Cursor)
	}
	limit := options.Limit
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 100 {
		return nil, ErrInvalidRequest
	}
	values.Set("limit", strconv.Itoa(limit))
	if options.Direction != "" {
		if !validDirection(options.Direction) {
			return nil, ErrInvalidRequest
		}
		values.Set("direction", string(options.Direction))
	}
	if options.State != "" {
		if !validTransferState(options.State) {
			return nil, ErrInvalidRequest
		}
		values.Set("state", string(options.State))
	}
	return values, nil
}

func hardenedHTTPClient(supplied *http.Client) *http.Client {
	if supplied == nil {
		return &http.Client{
			Timeout: defaultTimeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	clone := *supplied
	if clone.Timeout <= 0 {
		clone.Timeout = defaultTimeout
	}
	if clone.CheckRedirect == nil {
		clone.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	return &clone
}

func parseBaseURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, ErrInvalidConfiguration
	}
	if parsed.Scheme == "https" {
		return parsed, nil
	}
	if parsed.Scheme != "http" {
		return nil, ErrInvalidConfiguration
	}
	host := parsed.Hostname()
	if host == "localhost" || host == "::1" {
		return parsed, nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return nil, ErrInvalidConfiguration
	}
	return parsed, nil
}

func validBearer(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && len(value) <= maximumBearerBytes && !strings.ContainsAny(value, "\r\n")
}

func validPortableIdentifier(value string, maximum int) bool {
	return value != "" && len(value) <= maximum && portableIdentifier.MatchString(value)
}

func validIdempotencyKey(value string) bool {
	return len(value) >= 16 && len(value) <= 128 && portableIdentifier.MatchString(value)
}

func validUUID(value string) bool {
	return canonicalUUID.MatchString(value)
}

func validCursor(value string) bool {
	return value != "" && len(value) <= 512 && !strings.ContainsAny(value, "\r\n")
}

func validDirection(value TransferDirection) bool {
	return value == DirectionMemeBankToClipTown || value == DirectionClipTownToMemeBank
}

func validTransferState(value TransferState) bool {
	switch value {
	case TransferPending, TransferAcknowledged, TransferIgnored, TransferRejected, TransferExpired, TransferCancelled:
		return true
	default:
		return false
	}
}

func validMediaType(value string) bool {
	if value == "" || len(value) > 128 || strings.Contains(value, ";") {
		return false
	}
	parsed, parameters, err := mime.ParseMediaType(value)
	return err == nil && parsed == value && strings.Contains(parsed, "/") && len(parameters) == 0
}

func validSHA256(value string) bool {
	if len(value) != 43 && len(value) != 44 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSuffix(value, "="))
	return err == nil && len(decoded) == 32
}

func validBase64(value string, maximum int) bool {
	if value == "" || len(value) > maximum {
		return false
	}
	_, ok := decodedBase64Length(value)
	return ok
}

func decodedBase64Length(value string) (int, bool) {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(value)
	}
	if err != nil {
		return 0, false
	}
	return len(decoded), true
}
