use hmac::{Hmac, Mac};
use sha2::Sha256;
use unicode_normalization::UnicodeNormalization;

type HmacSha256 = Hmac<Sha256>;

/// Produces deterministic, keyed terms for server-side candidate retrieval.
/// The server cannot reverse these values without the per-user search key.
pub fn blind_terms(search_key: &[u8], plaintext: &str) -> Vec<String> {
    let normalized = plaintext.nfkc().collect::<String>().to_lowercase();
    let mut words: Vec<_> = normalized
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| word.len() >= 2)
        .take(256)
        .collect();
    words.sort_unstable();
    words.dedup();
    words
        .into_iter()
        .map(|word| {
            let mut mac =
                HmacSha256::new_from_slice(search_key).expect("HMAC accepts any key size");
            mac.update(word.as_bytes());
            hex::encode(mac.finalize().into_bytes())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terms_are_normalized_and_deduplicated() {
        let first = blind_terms(b"key", "Café cafe CAFE");
        let second = blind_terms(b"key", "café cafe");
        assert_eq!(first, second);
        assert_eq!(first.len(), 2);
    }
}
