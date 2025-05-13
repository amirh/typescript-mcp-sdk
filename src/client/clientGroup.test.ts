import { ClientGroup } from "./clientGroup.js";
import { Client } from "./index.js";
import { Tool, CallToolRequest, CallToolResultSchema, Implementation } from "../types.js";

// Mock Client class for testing ClientGroup
export class MockClient extends Client {
  mockListTools = jest.fn();
  mockCallTool = jest.fn();
  mockClose = jest.fn();

  constructor(clientInfo: Implementation) {
    super(clientInfo);
  }

  listTools = this.mockListTools.mockImplementation(async () => {
    return [];
  });

  callTool = this.mockCallTool.mockImplementation(async (params) => {
    return { result: `mock result for ${params.name}` };
  });

  close = this.mockClose.mockImplementation(async () => {
    // Do nothing
  });

  // Needed for the base class constructor but not used in these tests
  override async connect() {}
  override assertCapability() {}
  override assertCapabilityForMethod() {}
  override assertNotificationCapability() {}
  override assertRequestHandlerCapability() {}
}


describe("ClientGroup", () => {
  let mockClient1: MockClient;
  let mockClient2: MockClient;

  beforeEach(() => {
    mockClient1 = new MockClient({ name: "client1", version: "1.0" });
    mockClient2 = new MockClient({ name: "client2", version: "1.0" });
  });

  test("should list tools from all clients", async () => {
    const tool1: Tool = { name: "tool1", description: "description1", parameters: {}, inputSchema: { type: 'object' } };
    const tool2: Tool = { name: "tool2", description: "description2", parameters: {}, inputSchema: { type: 'object' } };
    mockClient1.mockListTools.mockResolvedValueOnce({ tools: [tool1] });
    mockClient2.mockListTools.mockResolvedValueOnce({ tools: [tool2] });

    const clientGroup = await ClientGroup.create([mockClient1, mockClient2]);

    const tools = await clientGroup.listTools();
    expect(mockClient1.mockListTools).toHaveBeenCalled();
    expect(mockClient2.mockListTools).toHaveBeenCalled();
    expect(tools).toHaveLength(2);
    expect(tools).toEqual(expect.arrayContaining([tool1, tool2]));
  });

  test("should call the correct tool on the correct client", async () => {
    const tool1: Tool = { name: "tool1", description: "description1", parameters: {}, inputSchema: { type: 'object' } };
    const tool2: Tool = { name: "tool2", description: "description2", parameters: {}, inputSchema: { type: 'object' } };
    mockClient1.mockListTools.mockResolvedValueOnce({ tools: [tool1] });
    mockClient2.mockListTools.mockResolvedValueOnce({ tools: [tool2] });

    const clientGroup = await ClientGroup.create([mockClient1, mockClient2]);

    const params: CallToolRequest["params"] = {
      name: "tool1",
      parameters: { arg: "value" },
    };
    const result = await clientGroup.callTool(params, CallToolResultSchema);

    expect(mockClient1.mockCallTool).toHaveBeenCalledWith(
      params,
      CallToolResultSchema,
      undefined
    );
    expect(mockClient2.mockCallTool).not.toHaveBeenCalled();
    expect(result).toEqual({ result: "mock result for tool1" });
  });

  test("should throw error if tool is not found", async () => {
    mockClient1.mockListTools.mockResolvedValueOnce({ tools: [] });
    mockClient2.mockListTools.mockResolvedValueOnce({ tools: [] });

    const clientGroup = await ClientGroup.create([mockClient1, mockClient2]);

    const params: CallToolRequest["params"] = {
      name: "nonExistentTool",
      parameters: {},
    };

    await expect(clientGroup.callTool(params, CallToolResultSchema)).rejects.toThrow(
      "Trying to call too nonExistentTool which is not provided by the client group"
    );
  });

  test("should call close on all clients", async () => {
    mockClient1.mockListTools.mockResolvedValueOnce({ tools: [] });
    mockClient2.mockListTools.mockResolvedValueOnce({ tools: [] });

    const clientGroup = await ClientGroup.create([mockClient1, mockClient2]);
    await clientGroup.close();

    expect(mockClient1.mockClose).toHaveBeenCalled();
    expect(mockClient2.mockClose).toHaveBeenCalled();
  });
});
