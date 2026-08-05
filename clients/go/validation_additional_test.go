package cliptownclient

import "testing"

func TestUUIDv7TransferIdentifiersAreAccepted(t *testing.T) {
	t.Parallel()

	if !validUUID("0198c4e8-5f4b-7d26-8c21-c4b44277b128") {
		t.Fatal("canonical UUIDv7 should be accepted")
	}
	if validUUID("0198c4e85f4b7d268c21c4b44277b128") {
		t.Fatal("non-canonical UUID without separators should be rejected")
	}
}

func TestContentLengthIsIndependentFromCiphertextExpansion(t *testing.T) {
	t.Parallel()

	request := validCreateRequest()
	request.ContentLength = 5
	if err := request.validate(); err != nil {
		t.Fatalf("source content length should not be required to equal AEAD ciphertext length: %v", err)
	}
}
