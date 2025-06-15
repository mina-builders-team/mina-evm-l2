import {
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
}) {}

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
				const emptyState = new RollupState({
					latestL2StateRoot: Field(0),
					latestProofCommitment: Field(0),
					latestDACommitment: Field(0),
				});
				transition.previousState.latestL2StateRoot.assertEquals(
					emptyState.latestL2StateRoot,
				);
				transition.previousState.latestProofCommitment.assertEquals(
					emptyState.latestProofCommitment,
				);
				transition.previousState.latestDACommitment.assertEquals(
					emptyState.latestDACommitment,
				);

				const newInitialState = new RollupState({
					latestL2StateRoot: initialState.initialL2StateRoot,
					latestProofCommitment: initialState.initialProofCommitment,
					latestDACommitment: initialState.initialDACommitment,
				});

				transition.newState.latestL2StateRoot.assertEquals(
					newInitialState.latestL2StateRoot,
				);
				transition.newState.latestProofCommitment.assertEquals(
					newInitialState.latestProofCommitment,
				);
				transition.newState.latestDACommitment.assertEquals(
					newInitialState.latestDACommitment,
				);
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
				transition.previousState.latestL2StateRoot.assertEquals(
					previousStateFromProof.latestL2StateRoot,
				);
				transition.previousState.latestProofCommitment.assertEquals(
					previousStateFromProof.latestProofCommitment,
				);
				transition.previousState.latestDACommitment.assertEquals(
					previousStateFromProof.latestDACommitment,
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
				const computedNewState = new RollupState({
					latestL2StateRoot: externalInputs.newProposedL2StateRoot,
					latestProofCommitment: externalInputs.newExternalProofCommitment,
					latestDACommitment: externalInputs.dataAvailabilityCommitment,
				});

				transition.newState.latestL2StateRoot.assertEquals(
					computedNewState.latestL2StateRoot,
				);
				transition.newState.latestProofCommitment.assertEquals(
					computedNewState.latestProofCommitment,
				);
				transition.newState.latestDACommitment.assertEquals(
					computedNewState.latestDACommitment,
				);
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

	init() {
		super.init();
		this.latestL2StateRoot.set(Field(0));
		this.latestProofCommitment.set(Field(0));
		this.latestDACommitment.set(Field(0));

		this.account.permissions.set({
			...Permissions.default(),
			editState: Permissions.proof(),
		});
	}

	@method async update(proof: StateTransitionProof) {
		const currentL2StateRoot = this.latestL2StateRoot.getAndRequireEquals();
		const currentProofCommitment =
			this.latestProofCommitment.getAndRequireEquals();
		const currentDACommitment = this.latestDACommitment.getAndRequireEquals();

		const previousState = proof.publicInput.previousState;

		previousState.latestL2StateRoot.assertEquals(currentL2StateRoot);
		previousState.latestProofCommitment.assertEquals(currentProofCommitment);
		previousState.latestDACommitment.assertEquals(currentDACommitment);

		proof.verify();

		const newState = proof.publicInput.newState;
		this.latestL2StateRoot.set(newState.latestL2StateRoot);
		this.latestProofCommitment.set(newState.latestProofCommitment);
		this.latestDACommitment.set(newState.latestDACommitment);
	}
}
