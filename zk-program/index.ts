import {
	type DeployArgs,
	Field,
	Permissions,
	SelfProof,
	SmartContract,
	State,
	Struct,
	ZkProgram,
	method,
	state,
} from "o1js";

export class RollupState extends Struct({
	latestL2StateRoot: Field,
	latestProofCommitment: Field,
	latestDACommitment: Field,
}) {
	static createEmpty() {
		return new RollupState({
			latestL2StateRoot: Field(0),
			latestProofCommitment: Field(0),
			latestDACommitment: Field(0),
		});
	}

	static assertEquals(state1: RollupState, state2: RollupState) {
		state1.latestL2StateRoot.assertEquals(state2.latestL2StateRoot);
		state1.latestProofCommitment.assertEquals(state2.latestProofCommitment);
		state1.latestDACommitment.assertEquals(state2.latestDACommitment);
	}

	static createFromInputs(inputs: InitialStateInputs) {
		return new RollupState({
			latestL2StateRoot: inputs.initialL2StateRoot,
			latestProofCommitment: inputs.initialProofCommitment,
			latestDACommitment: inputs.initialDACommitment,
		});
	}

	static createFromExternalInputs(externalInputs: ExternalProofInputs) {
		return new RollupState({
			latestL2StateRoot: externalInputs.newProposedL2StateRoot,
			latestProofCommitment: externalInputs.newExternalProofCommitment,
			latestDACommitment: externalInputs.dataAvailabilityCommitment,
		});
	}
}

export class ExternalProofInputs extends Struct({
	previousL2StateRoot: Field,
	newProposedL2StateRoot: Field,
	dataAvailabilityCommitment: Field,
	newExternalProofCommitment: Field,
	initialDACommitment: Field,
}) {}

export class InitialStateInputs extends Struct({
	initialL2StateRoot: Field,
	initialProofCommitment: Field,
	initialDACommitment: Field,
}) {}

export class StateTransition extends Struct({
	previousState: RollupState,
	newState: RollupState,
}) {}

export const StateTransitionVerifier = ZkProgram({
	name: "L2StateTransitionVerifier",
	publicInput: StateTransition,
	methods: {
		initialize: {
			privateInputs: [InitialStateInputs],
			async method(
				transition: StateTransition, // public input
				initialState: InitialStateInputs,
			) {
				// The previous state for initialization is the zero state
				const emptyState = RollupState.createEmpty();
				RollupState.assertEquals(transition.previousState, emptyState);

				const newInitialState = RollupState.createFromInputs(initialState);
				RollupState.assertEquals(transition.newState, newInitialState);
			},
		},

		updateState: {
			privateInputs: [SelfProof, ExternalProofInputs],
			async method(
				transition: StateTransition, // public input
				previousStateProof: SelfProof<StateTransition, void>,
				externalInputs: ExternalProofInputs,
			) {
				previousStateProof.verify();

				const previousStateFromProof = previousStateProof.publicInput.newState;
				RollupState.assertEquals(
					transition.previousState,
					previousStateFromProof,
				);

				const currentState = transition.previousState;

				// 1. Consistency Check:
				// The external proof (from op-succinct/Nori-zk) must be based on the
				// current L2 state root that our ZkProgram is aware of.
				externalInputs.previousL2StateRoot.assertEquals(
					currentState.latestL2StateRoot,
					"External proof's previousL2StateRoot must match current on-chain L2 state root.",
				);

				// 2. External Proof Verification (TODO):
				// This is where the ZkProgram would cryptographically verify
				// the actual external ZK proof and perform consistency checks.
				const computedNewState =
					RollupState.createFromExternalInputs(externalInputs);
				RollupState.assertEquals(transition.newState, computedNewState);
			},
		},
	},
});

export class StateTransitionProof extends ZkProgram.Proof(
	StateTransitionVerifier,
) {}

export class SettlementContract extends SmartContract {
	@state(Field) latestL2StateRoot = State<Field>();
	@state(Field) latestProofCommitment = State<Field>();
	@state(Field) latestDACommitment = State<Field>();

	async deploy(args: DeployArgs) {
		await super.deploy(args);
		this.account.permissions.set({
			...Permissions.default(),
			editState: Permissions.proofOrSignature(),
		});
	}

	@method async initializeState(initialState: InitialStateInputs) {
		// Ensure we're starting from zero state
		const currentL2StateRoot = this.latestL2StateRoot.getAndRequireEquals();
		const currentProofCommitment =
			this.latestProofCommitment.getAndRequireEquals();
		const currentDACommitment = this.latestDACommitment.getAndRequireEquals();

		currentL2StateRoot.assertEquals(Field(0));
		currentProofCommitment.assertEquals(Field(0));
		currentDACommitment.assertEquals(Field(0));

		this.latestL2StateRoot.set(initialState.initialL2StateRoot);
		this.latestProofCommitment.set(initialState.initialProofCommitment);
		this.latestDACommitment.set(initialState.initialDACommitment);
	}

	@method async update(proof: StateTransitionProof) {
		// Get current on-chain state
		const currentState = new RollupState({
			latestL2StateRoot: this.latestL2StateRoot.getAndRequireEquals(),
			latestProofCommitment: this.latestProofCommitment.getAndRequireEquals(),
			latestDACommitment: this.latestDACommitment.getAndRequireEquals(),
		});

		// Verify proof is based on current on-chain state
		RollupState.assertEquals(proof.publicInput.previousState, currentState);

		// Verify the proof
		proof.verify();

		// Update to new state
		const newState = proof.publicInput.newState;
		this.latestL2StateRoot.set(newState.latestL2StateRoot);
		this.latestProofCommitment.set(newState.latestProofCommitment);
		this.latestDACommitment.set(newState.latestDACommitment);
	}
}
