import { RequestOptions } from "../shared/protocol.js";
import {
  Tool,
  CallToolRequest,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
} from "../types.js";
import { Client } from "./index.js";

export type ComponentRenamer = (
  clientName: string,
  componentName: string,
) => string;

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
 *
 * Example with renaming components to fix tool name conflicts:
 *
 * ```typescript
 *
 * // Define a renaming function
 * const renamer = (clientName: string, componentName: string) => {
 *   if (clientName === "client-2" && componentName === "ping") {
 *     return "ping2";
 *   }
 *   return componentName;
 * };
 *
 * // Create a client group with the renamer
 * // In this case both clients provide a `ping` tool.
 * const clientGroup = await ClientGroup.create([client1, client2], renamer);
 *
 * // List tools (will include "ping" and "ping2")
 * const tools = await clientGroup.listTools();
 *
 * // Call the renamed tool
 * const result = await clientGroup.callTool({ name: "ping2", params: {} });
 * ```
 */
export class ClientGroup {
  private _clients: Client[];
  private _allTools: Tool[];
  private _toolToClient: {
    [key: string]: { client: Client; origToolName: string };
  } = {};
  private _componentRename: (
    componentName: string,
    clientName: string,
  ) => string;

  private constructor(clients: Client[], componentRename?: ComponentRenamer) {
    this._clients = clients;
    this._allTools = [];
    this._componentRename =
      componentRename ??
      ((clientName: string, componentName: string) => componentName);
  }

  /**
   * Creates a new ClientGroup.
   *
   * @param clients The list of clients to include in the group.
   * @param componentRename An optional function to rename components (like tools or resources) to avoid name conflicts when combining multiple clients. The function takes the original component name and the client name as arguments and should return the new, unique component name. Defaults to using the original component name.
   */
  static async create(
    clients: Client[],
    componentRename?: (componentName: string, clientName: string) => string,
    options?: RequestOptions,
  ): Promise<ClientGroup> {
    const group = new ClientGroup(clients, componentRename);
    await group.update(options);
    return group;
  }

  private async update(options?: RequestOptions) {
    this._allTools = [];
    this._toolToClient = {};
    for (const client of this._clients) {
      for (const tool of (await client.listTools(options)).tools) {
        const origName = tool.name;
        tool.name = this._componentRename(client.name, tool.name);
        if (this._toolToClient[tool.name]) {
          throw new Error(`
            Tool name: ${tool.name} (original: ${origName}) is available on multiple servers
            `);
        }
        this._toolToClient[tool.name] = {
          client: client,
          origToolName: origName,
        };
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
    resultSchema:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema = CallToolResultSchema,
    options?: RequestOptions,
  ) {
    if (!this._toolToClient[params.name]) {
      throw new Error(
        `Trying to call too ${params.name} which is not provided by the client group`,
      );
    }
    const actualParams = structuredClone(params);
    actualParams.name = this._toolToClient[params.name].origToolName;
    return this._toolToClient[params.name].client.callTool(
      actualParams,
      resultSchema,
      options,
    );
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
