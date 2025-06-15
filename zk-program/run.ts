import { AccountUpdate, Field, Mina, PrivateKey } from "o1js";
import {
	ExternalProofInputs,
	InitialStateInputs,
	RollupState,
	SettlementContract,
	StateTransition,
	StateTransitionVerifier,
} from "./index.js";

async function run() {
	console.log("Starting script...");

	const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
	Mina.setActiveInstance(Local);

	const deployerAccount = Local.testAccounts[0];
	const deployerKey = deployerAccount.key;
	const senderAccount = Local.testAccounts[1];
	const senderKey = senderAccount.key;

	console.log("Compiling contracts...");
	await StateTransitionVerifier.compile();
	await SettlementContract.compile();
	console.log("Compilation complete.");

	const zkAppAddress = PrivateKey.random();
	const zkApp = new SettlementContract(zkAppAddress.toPublicKey());

	console.log("Deploying contract...");
	const txn = await Mina.transaction(deployerAccount, async () => {
		AccountUpdate.fundNewAccount(deployerAccount);
		await zkApp.deploy({});
	});
	await txn.prove();
	await txn.sign([deployerKey, zkAppAddress]).send();
	console.log("Contract deployed.");

	console.log(
		"Initial on-chain state (L2 State Root):",
		zkApp.latestL2StateRoot.get().toString(),
	);

	// 1. Initialize the contract state
	console.log("Initializing contract state...");
	const initialStateInputs = new InitialStateInputs({
		initialL2StateRoot: Field(100),
		initialProofCommitment: Field(101),
		initialDACommitment: Field(102),
	});

	const initTxn = await Mina.transaction(senderAccount, async () => {
		await zkApp.initializeState(initialStateInputs);
	});
	await initTxn.prove();
	await initTxn.sign([senderKey]).send();
	console.log("Contract state initialized.");

	console.log(
		"On-chain state after initialization (L2 State Root):",
		zkApp.latestL2StateRoot.get().toString(),
	);

	// 2. Create the initial proof (base case)
	console.log("Creating initial proof...");
	const initialTransition = new StateTransition({
		previousState: RollupState.createEmpty(),
		newState: RollupState.createFromInputs(initialStateInputs),
	});

	const proof0 = await StateTransitionVerifier.initialize(
		initialTransition,
		initialStateInputs,
	);
	console.log("Initial proof created.");

	// 3. Create a subsequent proof (recursive step)
	console.log("Creating subsequent proof...");
	const externalInputs = new ExternalProofInputs({
		previousL2StateRoot: initialStateInputs.initialL2StateRoot, // This must match the previous state
		newProposedL2StateRoot: Field(200),
		dataAvailabilityCommitment: Field(202),
		newExternalProofCommitment: Field(201),
		initialDACommitment: Field(0), // Not used in update, but required by struct
	});

	const subsequentTransition = new StateTransition({
		previousState: initialTransition.newState, // The new state from the last transition
		newState: RollupState.createFromExternalInputs(externalInputs),
	});

	const proof1 = await StateTransitionVerifier.updateState(
		subsequentTransition,
		proof0.proof,
		externalInputs,
	);
	console.log("Subsequent proof created.");

	// 4. Update the contract with the subsequent proof
	console.log("Updating contract with subsequent proof...");
	const updateTxn = await Mina.transaction(senderAccount, async () => {
		await zkApp.update(proof1.proof);
	});
	await updateTxn.prove();
	await updateTxn.sign([senderKey]).send();
	console.log("Contract updated with subsequent proof.");

	console.log(
		"On-chain state after 2nd update (L2 State Root):",
		zkApp.latestL2StateRoot.get().toString(),
	);

	console.log("Script finished successfully.");
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
