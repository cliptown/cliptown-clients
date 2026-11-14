use hmac::{Hmac, Mac};
use sha2::Sha256;
use unicode_normalization::UnicodeNormalization;

type HmacSha256 = Hmac<Sha256>;

/// Produces deterministic, keyed terms for server-side candidate retrieval.
/// The server cannot reverse these values without the per-user search key.
pub fn blind_terms(search_key: &[u8], plaintext: &str) -> Vec<String> {
    let normalized = plaintext.nfkc().collect::<String>().to_lowercase();
    // Keep the first 256 unique words, then emit sorted, keyed digests.
    // Functional iterator state avoids introducing new mutable bindings.
    let words: std::collections::BTreeSet<_> = normalized
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| word.len() >= 2)
        .scan(std::collections::HashSet::new(), |seen, word| {
            if seen.len() >= 256 {
                None
            } else {
                Some(seen.insert(word).then_some(word))
            }
        })
        .flatten()
        .collect();
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
    fn repeated_early_words_do_not_starve_later_unique_terms() {
        let repeated = format!("{} distinctive", "repeat ".repeat(400));
        let terms = blind_terms(b"stable-search-key", &repeated);
        assert_eq!(terms.len(), 2);
        assert_eq!(
            terms,
            blind_terms(b"stable-search-key", "repeat distinctive")
        );
    }

    #[test]
    fn unique_terms_remain_capped_at_256() {
        let words = (0..300)
            .map(|n| format!("term{n}"))
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(blind_terms(b"stable-search-key", &words).len(), 256);
    }

    #[test]
    fn terms_are_normalized_and_deduplicated() {
        let first = blind_terms(b"key", "Café cafe CAFE");
        let second = blind_terms(b"key", "café cafe");
        assert_eq!(first, second);
        assert_eq!(first.len(), 2);
    }
}
