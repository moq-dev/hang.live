import eslint from "@eslint/js";
import solid from "eslint-plugin-solid/configs/typescript";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["**/dist", "**/node_modules", "**/target"],
	},
	eslint.configs.recommended,
	tseslint.configs.recommended,
	solid,
);
