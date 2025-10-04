export class ShaderProgram {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	uniforms: Map<string, WebGLUniformLocation>;
	attributes: Map<string, number>;

	constructor(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
		this.gl = gl;
		this.uniforms = new Map();
		this.attributes = new Map();

		const vertexShader = this.#compileShader(gl.VERTEX_SHADER, vertexSource);
		const fragmentShader = this.#compileShader(gl.FRAGMENT_SHADER, fragmentSource);

		const program = gl.createProgram();
		if (!program) {
			throw new Error("Failed to create shader program");
		}

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const info = gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
			throw new Error(`Shader program link failed: ${info}`);
		}

		this.program = program;

		// Clean up shaders after linking
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
	}

	#compileShader(type: number, source: string): WebGLShader {
		const gl = this.gl;
		const shader = gl.createShader(type);
		if (!shader) {
			throw new Error("Failed to create shader");
		}

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const info = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw new Error(`Shader compilation failed: ${info}`);
		}

		return shader;
	}

	use() {
		this.gl.useProgram(this.program);
	}

	getUniform(name: string): WebGLUniformLocation {
		let location = this.uniforms.get(name);
		if (location === undefined) {
			const loc = this.gl.getUniformLocation(this.program, name);
			if (!loc) {
				throw new Error(`Uniform ${name} not found`);
			}
			this.uniforms.set(name, loc);
			location = loc;
		}
		return location;
	}

	getAttribute(name: string): number {
		let location = this.attributes.get(name);
		if (location === undefined) {
			const loc = this.gl.getAttribLocation(this.program, name);
			if (loc === -1) {
				throw new Error(`Attribute ${name} not found`);
			}
			this.attributes.set(name, loc);
			location = loc;
		}
		return location;
	}

	setUniform1f(name: string, value: number) {
		this.gl.uniform1f(this.getUniform(name), value);
	}

	setUniform2f(name: string, x: number, y: number) {
		this.gl.uniform2f(this.getUniform(name), x, y);
	}

	setUniform3f(name: string, x: number, y: number, z: number) {
		this.gl.uniform3f(this.getUniform(name), x, y, z);
	}

	setUniform4f(name: string, x: number, y: number, z: number, w: number) {
		this.gl.uniform4f(this.getUniform(name), x, y, z, w);
	}

	setUniform1i(name: string, value: number) {
		this.gl.uniform1i(this.getUniform(name), value);
	}

	setUniformMatrix4fv(name: string, value: Float32Array) {
		this.gl.uniformMatrix4fv(this.getUniform(name), false, value);
	}

	cleanup() {
		this.gl.deleteProgram(this.program);
	}
}
