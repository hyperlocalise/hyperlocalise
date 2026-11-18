package publicauth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testWorkOSClientID = "client_test_publicauth"
	testAuthkitDomain  = "auth.example.test"
	testAuthkitIssuer  = "https://" + testAuthkitDomain
	testPublicAppURL   = "https://app.example.test/some/path"
)

type jwtFixture struct {
	privateKey *rsa.PrivateKey
	jwks       *workos.JWKSResponse
}

func newJWTFixture(t *testing.T) jwtFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return jwtFixture{
		privateKey: key,
		jwks: &workos.JWKSResponse{
			Keys: []*workos.JWKSResponseKeys{{
				Alg: "RS256",
				Kty: "RSA",
				Use: "sig",
				Kid: "test-kid",
				N:   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
			}},
		},
	}
}

func (f jwtFixture) sign(t *testing.T, claims map[string]any) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(claims))
	token.Header["kid"] = "test-kid"
	signed, err := token.SignedString(f.privateKey)
	require.NoError(t, err)
	return signed
}
