use cliptown_contract_boundary::{boundary_errors, validate_client_targets};
use serde_json::Value;
use std::{fs, path::Path, process::ExitCode};

fn validate(root: &Path) -> Result<(usize, usize), String> {
    let file = root.join("clients/api-surface.json");
    let bytes = fs::read(&file).map_err(|_| "cannot read canonical API surface")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("canonical API surface exceeds 2 MiB".to_owned());
    }
    let surface: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "invalid canonical API surface JSON")?;
    let leaks = boundary_errors(&surface);
    if !leaks.is_empty() {
        return Err(format!("public API exposes private named types: {}", leaks.len()));
    }

    let mut directories = Vec::new();
    for entry in fs::read_dir(root.join("clients"))
        .map_err(|_| "cannot inspect client runtimes")?
    {
        let entry = entry.map_err(|_| "cannot read a client runtime entry")?;
        if entry.file_type().map_err(|_| "cannot inspect runtime type")?.is_dir() {
            directories.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    let count = validate_client_targets(directories.iter().map(String::as_str))?;
    let symbols = surface
        .get("symbols")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    Ok((symbols, count))
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let root = args.next().unwrap_or_else(|| ".".to_string());
    if args.next().is_some() {
        eprintln!("usage: cliptown-contract-boundary [repository-root]");
        return ExitCode::from(2);
    }
    match validate(Path::new(&root)) {
        Ok((symbols, targets)) => {
            println!("Rust client boundary validated {symbols} symbols across {targets} targets");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("client boundary: {message}");
            ExitCode::FAILURE
        }
    }
}
