package ironsession

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	macPrefix          = "Fe26.2"
	passwordID         = "1"
	minPasswordLength  = 32
	keyLength          = 32
	ivLength           = 16
	saltBytes          = 32
	pbkdf2Iterations   = 1
	ironSessionVersion = "2"
	versionDelimiter   = "~"
	sealedPartCount    = 8
	maxPlaintextBytes  = 1 << 20
)

// ErrInvalidSeal is returned when the cookie is not a valid iron-session blob.
var ErrInvalidSeal = errors.New("invalid iron-session seal")

// Unseal decrypts an AuthKit / iron-session v8 cookie into dest.
// Accepts both the raw Fe26.2 payload and the `~2` suffixed form AuthKit stores.
func Unseal(sealed, password string, dest any) error {
	if err := validatePassword(password); err != nil {
		return err
	}

	payload, _, _ := strings.Cut(strings.TrimSpace(sealed), versionDelimiter)
	parts := strings.Split(payload, "*")
	if len(parts) != sealedPartCount {
		return fmt.Errorf("%w: incorrect number of sealed components", ErrInvalidSeal)
	}

	prefix, id, encSalt, ivB64, encryptedB64, expiration, hmacSalt, digestB64 :=
		parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], parts[7]
	if prefix != macPrefix {
		return fmt.Errorf("%w: wrong mac prefix", ErrInvalidSeal)
	}
	if err := checkExpiration(expiration); err != nil {
		return err
	}

	macBase := strings.Join([]string{prefix, id, encSalt, ivB64, encryptedB64, expiration}, "*")
	expected, err := hmacDigest(password, hmacSalt, macBase)
	if err != nil {
		return err
	}
	actual, err := base64.RawURLEncoding.DecodeString(digestB64)
	if err != nil {
		return fmt.Errorf("%w: invalid hmac encoding", ErrInvalidSeal)
	}
	if !hmac.Equal(expected, actual) {
		return fmt.Errorf("%w: bad hmac value", ErrInvalidSeal)
	}

	iv, err := base64.RawURLEncoding.DecodeString(ivB64)
	if err != nil || len(iv) != ivLength {
		return fmt.Errorf("%w: invalid iv", ErrInvalidSeal)
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(encryptedB64)
	if err != nil {
		return fmt.Errorf("%w: invalid ciphertext", ErrInvalidSeal)
	}

	plaintext, err := decryptAES256CBC(password, encSalt, iv, ciphertext)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidSeal, err)
	}
	if err := json.Unmarshal(plaintext, dest); err != nil {
		return fmt.Errorf("%w: invalid payload", ErrInvalidSeal)
	}
	return nil
}

// Seal encrypts data in the AuthKit / iron-session v8 format (`Fe26.2*…~2`).
func Seal(data any, password string) (string, error) {
	if err := validatePassword(password); err != nil {
		return "", err
	}

	plaintext, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshal session: %w", err)
	}

	encSalt, err := randomHex(saltBytes)
	if err != nil {
		return "", err
	}
	iv, err := randomBytes(ivLength)
	if err != nil {
		return "", err
	}
	ciphertext, err := encryptAES256CBC(password, encSalt, iv, plaintext)
	if err != nil {
		return "", err
	}

	ivB64 := base64.RawURLEncoding.EncodeToString(iv)
	encryptedB64 := base64.RawURLEncoding.EncodeToString(ciphertext)
	macBase := strings.Join([]string{macPrefix, passwordID, encSalt, ivB64, encryptedB64, ""}, "*")

	hmacSalt, err := randomHex(saltBytes)
	if err != nil {
		return "", err
	}
	digest, err := hmacDigest(password, hmacSalt, macBase)
	if err != nil {
		return "", err
	}

	sealed := macBase + "*" + hmacSalt + "*" + base64.RawURLEncoding.EncodeToString(digest)
	return sealed + versionDelimiter + ironSessionVersion, nil
}

func IsSealed(value string) bool {
	payload, _, _ := strings.Cut(strings.TrimSpace(value), versionDelimiter)
	return strings.HasPrefix(payload, macPrefix+"*")
}

func checkExpiration(expiration string) error {
	if expiration == "" {
		return nil
	}
	if len(expiration) == 0 || expiration[0] == '0' {
		return fmt.Errorf("%w: invalid expiration", ErrInvalidSeal)
	}
	for _, c := range expiration {
		if c < '0' || c > '9' {
			return fmt.Errorf("%w: invalid expiration", ErrInvalidSeal)
		}
	}
	exp, err := strconv.ParseInt(expiration, 10, 64)
	if err != nil {
		return fmt.Errorf("%w: invalid expiration", ErrInvalidSeal)
	}
	const timestampSkewMS = 60 * 1000
	if exp <= time.Now().UnixMilli()-timestampSkewMS {
		return fmt.Errorf("%w: expired seal", ErrInvalidSeal)
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < minPasswordLength {
		return errors.New("cookie password must be at least 32 characters")
	}
	return nil
}

func deriveKey(password, salt string) ([]byte, error) {
	return pbkdf2.Key(sha1.New, password, []byte(salt), pbkdf2Iterations, keyLength)
}

func hmacDigest(password, salt, message string) ([]byte, error) {
	key, err := deriveKey(password, salt)
	if err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(message))
	return mac.Sum(nil), nil
}

func encryptAES256CBC(password, salt string, iv, plaintext []byte) ([]byte, error) {
	key, err := deriveKey(password, salt)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	padded, err := pkcs7Pad(plaintext, aes.BlockSize)
	if err != nil {
		return nil, err
	}
	out := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(out, padded)
	return out, nil
}

func decryptAES256CBC(password, salt string, iv, ciphertext []byte) ([]byte, error) {
	key, err := deriveKey(password, salt)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return nil, errors.New("invalid ciphertext length")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	plain := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(plain, ciphertext)
	return pkcs7Unpad(plain)
}

func pkcs7Pad(data []byte, blockSize int) ([]byte, error) {
	if blockSize <= 0 || blockSize > 255 {
		return nil, errors.New("invalid block size")
	}
	if len(data) > maxPlaintextBytes {
		return nil, errors.New("plaintext too large")
	}
	pad := blockSize - (len(data) % blockSize)
	n := len(data) + pad
	if n < len(data) {
		return nil, errors.New("plaintext too large")
	}
	out := make([]byte, n)
	copy(out, data)
	for i := len(data); i < n; i++ {
		out[i] = byte(pad)
	}
	return out, nil
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty plaintext")
	}
	pad := int(data[len(data)-1])
	if pad == 0 || pad > len(data) || pad > aes.BlockSize {
		return nil, errors.New("invalid padding")
	}
	if subtle.ConstantTimeCompare(data[len(data)-pad:], bytesRepeat(byte(pad), pad)) != 1 {
		return nil, errors.New("invalid padding")
	}
	return data[:len(data)-pad], nil
}

func bytesRepeat(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}

func randomBytes(n int) ([]byte, error) {
	out := make([]byte, n)
	if _, err := rand.Read(out); err != nil {
		return nil, err
	}
	return out, nil
}

func randomHex(n int) (string, error) {
	raw, err := randomBytes(n)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}
