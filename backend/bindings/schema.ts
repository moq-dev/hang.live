import { z } from "zod/v4-mini";

// Checks for extra keys in schema not defined in the model
type ExtraKeys<Schema, Model> = Exclude<keyof Schema, keyof Model>;

// If there are extra keys, raise a type error
type ThrowIfExtraKeys<Schema, Model> =
	ExtraKeys<Schema, Model> extends never ? unknown : { [key: string]: never };

// Branded schema that carries type information
export type Schema<T> = z.ZodMiniType<T> & {
	readonly __brand: unique symbol;
	readonly __type: T;
};

// Enforces that a schema matches the expected type and brands it.
// This is how we ensure that the Rust and Typescript types are in sync.
// Based on: https://github.com/colinhacks/zod/issues/372#issuecomment-2972857949
export function schema<Model>() {
	return <
		SchemaDefinition extends { [K in keyof Model]: z.ZodMiniType<Model[K]> } & ThrowIfExtraKeys<
			SchemaDefinition,
			Model
		>,
	>(
		schema: SchemaDefinition
	): Schema<Model> => {
		return z.object(schema) as unknown as Schema<Model>;
	};
}

export const EmptySchema = schema()({});
