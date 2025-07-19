use anyhow::{Context, Result};
use clap::Parser;
use op_succinct_client_utils::{boot::BootInfoStruct, AGGREGATION_OUTPUTS_SIZE};
use serde_json::json;
use sp1_sdk::{proof::SP1ProofWithPublicValues, SP1Proof};
use std::fs;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Input binary proof file path
    #[arg(short, long)]
    input: String,

    /// Output JSON file path
    #[arg(short, long)]
    output: String,
}

fn extract_proof_data(proof: &SP1Proof) -> Result<serde_json::Value> {
    match proof {
        SP1Proof::Plonk(plonk_proof) => {
            // For PLONK proofs, format exactly as expected by nori-zk
            let public_inputs: Vec<String> = plonk_proof
                .public_inputs
                .iter()
                .map(|input| input.to_string())
                .collect();
            
            Ok(json!({
                "Plonk": {
                    "public_inputs": public_inputs,
                    "encoded_proof": hex::encode(plonk_proof.encoded_proof.clone()),
                    "raw_proof": hex::encode(plonk_proof.raw_proof.clone()),
                    "plonk_vkey_hash": plonk_proof.plonk_vkey_hash
                }
            }))
        }
        SP1Proof::Groth16(groth16_proof) => {
            // For Groth16 proofs
            let public_inputs: Vec<String> = groth16_proof
                .public_inputs
                .iter()
                .map(|input| input.to_string())
                .collect();
            
            Ok(json!({
                "Groth16": {
                    "public_inputs": public_inputs,
                    "encoded_proof": hex::encode(groth16_proof.encoded_proof.clone()),
                    "raw_proof": hex::encode(groth16_proof.raw_proof.clone()),
                    "groth16_vkey_hash": groth16_proof.groth16_vkey_hash
                }
            }))
        }
        SP1Proof::Compressed(_) => {
            // For compressed proofs, use bincode serialization
            // Convert to placeholder PLONK format for nori-zk compatibility
            let proof_bytes = bincode::serialize(proof)?;
            let placeholder_hash = vec![0u8; 32];
            Ok(json!({
                "Plonk": {
                    "public_inputs": ["0"], // Placeholder
                    "encoded_proof": hex::encode(&proof_bytes),
                    "raw_proof": hex::encode(&proof_bytes),
                    "plonk_vkey_hash": placeholder_hash
                }
            }))
        }
        _ => {
            // For other proof types, convert to placeholder PLONK format
            let proof_bytes = bincode::serialize(proof)?;
            let placeholder_hash = vec![0u8; 32];
            Ok(json!({
                "Plonk": {
                    "public_inputs": ["0"], // Placeholder
                    "encoded_proof": hex::encode(&proof_bytes),
                    "raw_proof": hex::encode(&proof_bytes),
                    "plonk_vkey_hash": placeholder_hash
                }
            }))
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Load the SP1 proof from binary file
    let mut proof_with_public_values = SP1ProofWithPublicValues::load(&args.input)
        .context(format!("Failed to load proof from {}", args.input))?;

    // Extract proof data
    let proof_data = extract_proof_data(&proof_with_public_values.proof)
        .context("Failed to extract proof data")?;

    // Parse boot info from public values (for range proofs)
    let boot_info: BootInfoStruct = proof_with_public_values.public_values.read();
    
    // Get raw public values as bytes for the buffer field
    // For now, we'll create a minimal buffer from the boot info components
    let mut public_values_bytes = Vec::new();
    public_values_bytes.extend_from_slice(boot_info.l1Head.as_slice());
    public_values_bytes.extend_from_slice(boot_info.l2PreRoot.as_slice());
    public_values_bytes.extend_from_slice(boot_info.l2PostRoot.as_slice());
    public_values_bytes.extend_from_slice(&boot_info.l2BlockNumber.to_be_bytes());
    public_values_bytes.extend_from_slice(boot_info.rollupConfigHash.as_slice());

    let boot_info_json = json!({
        "parsed": true,
        "boot_info": {
            "l1Head": format!("0x{:x}", boot_info.l1Head),
            "l2PreRoot": format!("0x{:x}", boot_info.l2PreRoot),
            "l2PostRoot": format!("0x{:x}", boot_info.l2PostRoot),
            "l2BlockNumber": boot_info.l2BlockNumber,
            "rollupConfigHash": format!("0x{:x}", boot_info.rollupConfigHash)
        }
    });

    // Construct the final JSON structure
    let output_json = json!({
        "proof": proof_data,
        "public_values": {
            "buffer": {
                "data": public_values_bytes
            }
        },
        "boot_info": boot_info_json,
        "sp1_version": "v5.0.0",
        "metadata": {
            "original_file": args.input,
            "file_size": fs::metadata(&args.input)?.len(),
            "timestamp": chrono::Utc::now().to_rfc3339()
        }
    });

    // Write to output file
    fs::write(&args.output, serde_json::to_string_pretty(&output_json)?)
        .context(format!("Failed to write output to {}", args.output))?;

    println!("Successfully converted {} to {}", args.input, args.output);
    Ok(())
}
