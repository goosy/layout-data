import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";

export interface Layout_Entry {
	name: string;
	type: string;
	init_value: number | boolean;
	byte: number;
	index: number;
	size: number;
	mask: number;
}

export interface Layout {
	name: string;
	length: number;
	size: number;
	items: Record<string, any>[];
	entries: Map<string, Layout_Entry>;
	Data_Class: new (...args: any[]) => TData;
}

export interface Data_Struct {
	name: string;
	length: number;
	items: Record<string, any>[];
}

export interface TData_Options {
	detection?: "immediate" | "deferred";
	on_write?: (tdata: TData) => void;
}

export class TData extends EventEmitter {
	constructor(data_struct: Data_Struct | Layout, name: string, options?: TData_Options);
	name: string;
	readonly buffer: Buffer;
	readonly size: number;
	readonly layout: Layout;
	get(tagname: string): TTag | undefined;
	detect(): void;
	write_register(offset: number, value: number): void;
	write_bit(offset: number, mask: number, value: boolean): void;
	write_bytes(offset: number, source: Buffer): void;
}

export class TTag extends EventEmitter {
	readonly name: string;
	readonly type: string;
	readonly length: number;
	readonly entry: Layout_Entry;
	value: number | boolean;
}

export function compile_layout(yaml_path: string): {
	layouts: Record<string, Layout>;
	fragments: Record<string, Record<string, any>[]>;
};
export function layout_of(data_struct: Data_Struct): Layout;
export function build_structure(data_struct: { name: string }, items: Record<string, any>[]): Data_Struct;
export function validate_structure(data_struct: Data_Struct): string[];
export function set_access_tracer(tracer: ((tdata: TData, name: string, kind: "read" | "write") => void) | null): void;
export const TYPE_BITS: Record<string, number>;
export const CODECS: Record<string, any>;
export class Observer { }
export function io_index(byte: number, endian: string): number;
export function io_range(entry: Layout_Entry, endian: string): { start: number, end: number };
export function load_entry(entry: Layout_Entry, io_buffer: Buffer, buffer: Buffer, endian: string): void;
export function store_entry(entry: Layout_Entry, buffer: Buffer, io_buffer: Buffer, endian: string): void;
export function render_types(layouts: Record<string, Layout>, options: { source: string, tdata_module: string }): string;
