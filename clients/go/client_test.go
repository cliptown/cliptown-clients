package cliptownclient

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

const testTransferID = "550e8400-e29b-41d4-a716-446655440000"

func TestMemeBankTransferFlowUsesOnlyTheHTTPAPI(t *testing.T) {
	t.Parallel()

	requestValue := validCreateRequest()
	transfer := validTransfer(requestValue)
	var tokenCalls atomic.Int64
	var apiCalls atomic.Int64

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		apiCalls.Add(1)
		if request.Header.Get("Authorization") != "Bearer delegated-token" {
			http.Error(response, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch {
		case request.Method == http.MethodPost && request.URL.Path == "/v1/integrations/memebank/transfers":
			if request.Header.Get("Idempotency-Key") != "create-transfer-0001" {
				t.Errorf("missing create idempotency key")
			}
			var decoded CreateTransferRequest
			if err := json.NewDecoder(request.Body).Decode(&decoded); err != nil {
				t.Errorf("decode create request: %v", err)
			}
			response.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(response).Encode(transfer)
		case request.Method == http.MethodGet && request.URL.Path == "/v1/integrations/memebank/transfers":
			if request.URL.Query().Get("limit") != "25" || request.URL.Query().Get("direction") != string(DirectionMemeBankToClipTown) {
				t.Errorf("unexpected list query: %s", request.URL.RawQuery)
			}
			_ = json.NewEncoder(response).Encode(TransferPage{Items: []Transfer{transfer}})
		case request.Method == http.MethodGet && request.URL.Path == "/v1/integrations/memebank/transfers/"+testTransferID:
			_ = json.NewEncoder(response).Encode(transfer)
		case request.Method == http.MethodPost && request.URL.Path == "/v1/integrations/memebank/transfers/"+testTransferID+"/ack":
			if request.Header.Get("Idempotency-Key") != "ack-transfer-000001" {
				t.Errorf("missing acknowledgement idempotency key")
			}
			acknowledged := transfer
			acknowledged.State = TransferAcknowledged
			_ = json.NewEncoder(response).Encode(acknowledged)
		case request.Method == http.MethodDelete && request.URL.Path == "/v1/integrations/memebank/transfers/"+testTransferID:
			response.WriteHeader(http.StatusNoContent)
		default:
			http.Error(response, `{"error":"not_found"}`, http.StatusNotFound)
		}
	}))
	defer server.Close()

	client, err := New(
		server.URL,
		TokenProviderFunc(func(context.Context) (string, error) {
			tokenCalls.Add(1)
			return "delegated-token", nil
		}),
		WithHTTPClient(server.Client()),
	)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	ctx := context.Background()

	created, err := client.CreateMemeBankTransfer(ctx, "create-transfer-0001", requestValue)
	if err != nil || created.TransferID != testTransferID {
		t.Fatalf("create: transfer=%#v err=%v", created, err)
	}
	page, err := client.ListMemeBankTransfers(ctx, ListTransfersOptions{
		Limit:     25,
		Direction: DirectionMemeBankToClipTown,
	})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("list: page=%#v err=%v", page, err)
	}
	got, err := client.GetMemeBankTransfer(ctx, testTransferID)
	if err != nil || got.TransferID != testTransferID {
		t.Fatalf("get: transfer=%#v err=%v", got, err)
	}
	acknowledged, err := client.AcknowledgeMemeBankTransfer(
		ctx,
		testTransferID,
		"ack-transfer-000001",
		AcknowledgeTransferRequest{
			ContractVersion: ContractVersion,
			Disposition:     DispositionAcknowledged,
			ClientReceiptID: "receipt-transfer-001",
		},
	)
	if err != nil || acknowledged.State != TransferAcknowledged {
		t.Fatalf("acknowledge: transfer=%#v err=%v", acknowledged, err)
	}
	if err := client.CancelMemeBankTransfer(ctx, testTransferID); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	if tokenCalls.Load() != 5 || apiCalls.Load() != 5 {
		t.Fatalf("token calls=%d api calls=%d", tokenCalls.Load(), apiCalls.Load())
	}
}

func TestInvalidRequestsFailBeforeTokenLookupOrNetwork(t *testing.T) {
	t.Parallel()

	var tokenCalls atomic.Int64
	var networkCalls atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		networkCalls.Add(1)
		http.Error(response, "unexpected", http.StatusInternalServerError)
	}))
	defer server.Close()

	client, err := New(
		server.URL,
		TokenProviderFunc(func(context.Context) (string, error) {
			tokenCalls.Add(1)
			return "delegated-token", nil
		}),
		WithHTTPClient(server.Client()),
	)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	invalid := validCreateRequest()
	invalid.ContractVersion = 2
	if _, err := client.CreateMemeBankTransfer(context.Background(), "create-transfer-0001", invalid); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid request, got %v", err)
	}
	if _, err := client.GetMemeBankTransfer(context.Background(), "not-a-uuid"); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid transfer id, got %v", err)
	}
	if _, err := client.ListMemeBankTransfers(context.Background(), ListTransfersOptions{Limit: 101}); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid list limit, got %v", err)
	}
	if _, err := client.AcknowledgeMemeBankTransfer(
		context.Background(),
		testTransferID,
		"short",
		AcknowledgeTransferRequest{ContractVersion: ContractVersion, Disposition: DispositionIgnored, ClientReceiptID: "receipt-transfer-001"},
	); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("expected invalid idempotency key, got %v", err)
	}

	if tokenCalls.Load() != 0 || networkCalls.Load() != 0 {
		t.Fatalf("invalid input reached token provider or network: token=%d network=%d", tokenCalls.Load(), networkCalls.Load())
	}
}

func TestAuthorizationBearingRequestsRefuseRedirects(t *testing.T) {
	t.Parallel()

	var targetCalls atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		targetCalls.Add(1)
		if request.Header.Get("Authorization") != "" {
			t.Errorf("redirect target received authorization")
		}
		_ = json.NewEncoder(response).Encode(validTransfer(validCreateRequest()))
	}))
	defer target.Close()

	redirector := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.Redirect(response, request, target.URL, http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()

	client, err := New(
		redirector.URL,
		TokenProviderFunc(func(context.Context) (string, error) { return "delegated-token", nil }),
		WithHTTPClient(redirector.Client()),
	)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	_, err = client.GetMemeBankTransfer(context.Background(), testTransferID)
	var statusError *StatusError
	if !errors.As(err, &statusError) || statusError.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected redirect status error, got %v", err)
	}
	if targetCalls.Load() != 0 {
		t.Fatalf("redirect was followed %d times", targetCalls.Load())
	}
}

func TestStatusErrorsAreDeterministicAndBodySafe(t *testing.T) {
	t.Parallel()

	cases := []struct {
		status int
		want   error
	}{
		{http.StatusUnauthorized, ErrUnauthorized},
		{http.StatusForbidden, ErrForbidden},
		{http.StatusNotFound, ErrNotFound},
		{http.StatusConflict, ErrConflict},
		{http.StatusRequestEntityTooLarge, ErrPayloadTooLarge},
		{http.StatusUnprocessableEntity, ErrIncompatibleContract},
		{http.StatusTooManyRequests, ErrRateLimited},
		{http.StatusServiceUnavailable, ErrUnavailable},
	}
	for _, test := range cases {
		test := test
		t.Run(http.StatusText(test.status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				response.WriteHeader(test.status)
				_, _ = response.Write([]byte(`{"error":"bounded_code","ciphertext":"must-not-escape"}`))
			}))
			defer server.Close()
			client, err := New(
				server.URL,
				TokenProviderFunc(func(context.Context) (string, error) { return "delegated-token", nil }),
				WithHTTPClient(server.Client()),
			)
			if err != nil {
				t.Fatalf("new client: %v", err)
			}
			_, err = client.GetMemeBankTransfer(context.Background(), testTransferID)
			if !errors.Is(err, test.want) {
				t.Fatalf("status %d expected %v, got %v", test.status, test.want, err)
			}
			if stringsContains(err.Error(), "must-not-escape") {
				t.Fatalf("error leaked response content: %v", err)
			}
		})
	}
}

func TestUnknownMajorContractVersionFailsClosed(t *testing.T) {
	t.Parallel()

	transfer := validTransfer(validCreateRequest())
	transfer.ContractVersion = 2
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_ = json.NewEncoder(response).Encode(transfer)
	}))
	defer server.Close()
	client, err := New(
		server.URL,
		TokenProviderFunc(func(context.Context) (string, error) { return "delegated-token", nil }),
		WithHTTPClient(server.Client()),
	)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	_, err = client.GetMemeBankTransfer(context.Background(), testTransferID)
	if !errors.Is(err, ErrIncompatibleContract) {
		t.Fatalf("expected incompatible contract, got %v", err)
	}
}

func TestRemotePlaintextHTTPIsRejected(t *testing.T) {
	t.Parallel()

	_, err := New(
		"http://api.cliptown.app",
		TokenProviderFunc(func(context.Context) (string, error) { return "delegated-token", nil }),
	)
	if !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatalf("expected invalid configuration, got %v", err)
	}
}

func validCreateRequest() CreateTransferRequest {
	ciphertext := []byte("encrypted-image-payload")
	digest := sha256.Sum256([]byte("image-content"))
	return CreateTransferRequest{
		ContractVersion: ContractVersion,
		Direction:       DirectionMemeBankToClipTown,
		SourceItemID:    "memebank-asset-001",
		MediaType:       "image/png",
		ContentSHA256:   base64.RawURLEncoding.EncodeToString(digest[:]),
		ContentLength:   int64(len(ciphertext)),
		Payload: CipherEnvelope{
			Algorithm:  "xchacha20poly1305-v1",
			Nonce:      base64.StdEncoding.EncodeToString([]byte("012345678901234567890123")),
			Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
			KeyID:      "memebank-recipient-key-001",
		},
		ExpiresAt: time.Now().UTC().Add(time.Hour).Truncate(time.Second),
	}
}

func validTransfer(request CreateTransferRequest) Transfer {
	now := time.Now().UTC().Truncate(time.Second)
	return Transfer{
		CreateTransferRequest: request,
		TransferID:            testTransferID,
		State:                 TransferPending,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
}

func stringsContains(value, fragment string) bool {
	for index := 0; index+len(fragment) <= len(value); index++ {
		if value[index:index+len(fragment)] == fragment {
			return true
		}
	}
	return false
}
