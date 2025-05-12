import { RequestOptions } from "../shared/protocol.js";
import { Tool, CallToolRequest, CallToolResultSchema, CompatibilityCallToolResultSchema } from "../types.js";
import { Client } from "./index.js";

/**
 * A group of MCP clients.
 *
 * This class makes it easier to manage multiple MCP server connections.
 *
 * Example:
 *
 * ```typescript
 *
 * // Create a client group
 * const clientGroup = await ClientGroup.create([client1, client2]);
 *
 * // List tools from all clients
 * const tools = await clientGroup.listTools();
 *
 * // Call a tool by name
 * const result = await clientGroup.callTool({ name: "myTool", params: {} });
 *
 * // Close all clients
 * await clientGroup.close();
 * ```
 */
export class ClientGroup {
  private _clients: Client[];
  private _allTools: Tool[];
  private _toolToClient: { [key: string]: Client; } = {};

  private constructor(
    clients: Client[]
  ) {
    this._clients = clients;
    this._allTools = [];
  }

  /**
   * Creates a new ClientGroup.
   * 
   * @param clients The list of clients to include in the group.
   */
  static async create(
    clients: Client[],
    options?: RequestOptions
  ): Promise<ClientGroup> {
    const group = new ClientGroup(clients);
    await group.update(options);
    return group;
  }

  private async update(options?: RequestOptions) {
    this._allTools = [];
    this._toolToClient = {};
    for (const client of this._clients) {
      for (const tool of (await client.listTools(options)).tools) {
        if (this._toolToClient[tool.name]) {
          // TODO(amirh): we should allow the users to configure tool renames.
          console.warn(
            `Tool name: ${tool.name} is available on multiple servers, picking an arbitrary one`
          );
        }
        this._toolToClient[tool.name] = client;
        this._allTools.push(tool);
      }
    }
  }

  /**
   * Lists all tools available from all clients in the group.
   *
   * @param options Optional request options.
   * @returns A promise that resolves with a list of tools.
   */
  async listTools(): Promise<Tool[]> {
    return structuredClone(this._allTools);
  }

  /**
   * Calls a tool provided by one of the clients in the group.
   *
   * @param params The parameters for the tool call.
   * @param resultSchema The schema to use for validating the tool result.
   * @param options Optional request options.
   * @returns A promise that resolves with the tool result.
   * @throws An error if no client provides the requested tool.
   */
  async callTool(
    params: CallToolRequest["params"],
    resultSchema: typeof CallToolResultSchema |
      typeof CompatibilityCallToolResultSchema = CallToolResultSchema,
    options?: RequestOptions
  ) {
    if (!this._toolToClient[params.name]) {
      throw new Error(
        `Trying to call too ${params.name} which is not provided by the client group`
      );
    }
    return this._toolToClient[params.name].callTool(params, resultSchema, options);
  }

  /**
   * Closes all clients in the group.
   *
   * @returns A promise that resolves when all clients are closed.
   */
  async close() {
    for (const client of this._clients) {
      await client.close();
    }
  }
}
