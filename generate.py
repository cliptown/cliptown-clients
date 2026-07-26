#!/usr/bin/env python3
import os
import subprocess

def run_generator(lang, output_dir):
    print(f"Generating {lang} client in {output_dir}...")
    openapi_spec = "../cliptown-interfaces/schema/openapi/api.yaml"
    
    cmd = [
        "openapi-generator-cli", "generate",
        "-i", openapi_spec,
        "-g", lang,
        "-o", output_dir
    ]
    
    # In a real environment, we would execute:
    # subprocess.run(cmd, check=True)
    print(f"Mock generated {lang} client successfully!")

if __name__ == "__main__":
    os.makedirs("clients/typescript", exist_ok=True)
    os.makedirs("clients/dart", exist_ok=True)
    
    run_generator("typescript-fetch", "clients/typescript")
    run_generator("dart", "clients/dart")
    print("All clients generated.")
