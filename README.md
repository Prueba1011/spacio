# Spacio

**Warehouse design and slotting, in 3D, where people and AI agents work on the same model.**

Spacio is a browser-only warehouse lab. A person designs a small warehouse (perimeter, racks, aisles, accesses), loads the products that live in it, and compares slotting alternatives in a 3D scene. An AI agent works on that same model through **WebMCP**: it can read the facility, generate layouts, validate them, load and validate inventory, generate slotting plans, compare them, focus the camera, trace pick routes and read the approval state. What the agent can never do is approve: approval of a facility design and of a slotting plan are human-only checkpoints, and every agent call is written to a traceability log the person can inspect.

## Why WebMCP fits

Warehouse planning is a conversation between a spatial model and a human who is accountable for the result. Screen-scraping agents cannot reason about rack geometry, aisle widths or weight-per-level rules by looking at pixels of a 3D canvas. With WebMCP the page exposes its own domain functions, so:

- an agent can complete a whole planning loop in one turn ("create a 12 × 8 m picking warehouse, generate layouts, activate the one with most locations, validate it, then load this inventory and give me the plan with the shortest route") instead of clicking through five panels;
- the agent gets exact numbers back (locations, free reserve, route meters, warnings with codes) instead of guessing from the screen;
- the human keeps the decisions that carry liability: approving a design, approving a plan, applying moves, deleting projects. Those are page buttons only, and the tools report `approvedByHuman` truthfully.

## What people and agents can do together

| Person | Agent (via WebMCP) |
| --- | --- |
| Creates a project or picks a template | Creates, lists, duplicates, archives and exports projects |
| Shapes the space, places racks, sets aisles | Reads the facility, configures space and accesses, patches racks/zones/walls, generates and validates layouts |
| Approves a facility revision (human only) | Reads the approval state and knows whether the active revision is approved |
| Loads products by CSV or by hand | Validates candidate containers against rack geometry, replaces the inventory with an undo snapshot |
| Compares slotting alternatives in 3D | Generates deterministic plans, validates and compares them, locks bins, focuses racks, traces pick routes |
| Approves a plan and freezes its move list (human only) | Reads the frozen move list and the audit trail |

## WebMCP implementation

Tools are registered imperatively with `document.modelContext.registerTool()` (the page also accepts `navigator.modelContext` for older Chrome builds). Each tool declares a JSON Schema `inputSchema` with bounded numbers and enums, an `annotations.readOnlyHint` flag, and an async `execute` that returns plain JSON. Inputs are validated against the schema before execution (see [js/webmcp-validation.mjs](js/webmcp-validation.mjs)), unknown parameters are rejected, and every call is wrapped so its parameters, result, duration and errors land in the in-app Log panel.

The Design mode runs in an iframe. Because agents only see tools registered on the top-level document, the main page registers proxy tools that forward to the designer's API, so all 32 tools are visible from one document.

### Tool catalog (32 tools)

**Projects (8)** — `slotlab_list_warehouses`, `slotlab_create_warehouse`, `slotlab_get_warehouse`, `slotlab_update_warehouse`, `slotlab_open_warehouse`, `slotlab_duplicate_warehouse`, `slotlab_archive_warehouse`, `slotlab_export_warehouse`.

**Design (10)** — `facility3d_get_configuration`, `facility3d_configure_space`, `facility3d_configure_accesses`, `facility3d_apply_model_patch` (add/update/remove racks, zones, walls, doors, obstacles; supports dry run), `facility3d_generate_layouts`, `facility3d_activate_layout`, `facility3d_validate_layout`, `facility3d_compare_layouts`, `facility3d_clear_layout`, `facility3d_undo_design_change`.

**Products (14)** — `warehouse3d_get_snapshot`, `warehouse3d_validate_inventory`, `warehouse3d_replace_inventory`, `warehouse3d_undo_inventory_change`, `warehouse3d_generate_plans`, `warehouse3d_activate_plan`, `warehouse3d_validate_plan`, `warehouse3d_compare_plans`, `warehouse3d_get_move_list`, `warehouse3d_get_approval_state`, `warehouse3d_focus_rack`, `warehouse3d_set_bin_lock`, `warehouse3d_show_product_pick_route`, `warehouse3d_set_product_highlight`.

Open the **WebMCP tools** button in the app header to browse every tool with its schema, or the **Log** button to see what the agent did.

Where the registration lives: [js/project-hub.js](js/project-hub.js) (project tools), [index.html](index.html) (product tools, logging wrapper and design proxies), [facility-designer.html](facility-designer.html) (design tools).

## Try it with an agent

**ChatGPT desktop app (native site tools).** Latest desktop app, Settings → Browser → Permissions → *Enable site tools*, model GPT-5.6 Sol or Terra. Open the live URL in the built-in browser; the address bar shows *Site tools* with the 32 tools. Then ask, for example:

> Create a picking warehouse called "Lima North", generate layout alternatives, activate the one with the most locations and tell me if it validates.

> Add a 2.4 × 1.2 m dispatch dock at x 4.3, z −3.3, keeping the four racks of the Balanced layout, and validate the result.

> Load the sample inventory, generate slotting plans with heavy-item level 3 and give me the one with the shortest picking route and no warnings. Then focus rack R02 and show the outbound route for SKU BRA-100.

**Bring your own spreadsheet.** The sample data ships the way it reaches a real warehouse: one export per department. [assets/sample-master-logistics.xlsx](assets/sample-master-logistics.xlsx) is the article master from logistics (200 SKUs across shelving, fragile, refrigerated and pallet storage, sizes in cm, weights in grams or kg, fifteen spellings of four storage types, repeated headers and a free-text notes column), and [assets/sample-sales-august.xlsx](assets/sample-sales-august.xlsx) is the sales export from commercial (12,675 August order lines with mixed date formats and stray SKUs). Then ask, in order:

> Here is our article master (200 SKUs, about 420 rack locations). Configure a 54 × 30 m space with an 8 × 1.6 m rack module, 5 bays, 4 levels and 3.6 m forklift aisles, shared circulation with no separate pedestrian route. Generate layouts, keep only the balanced one (30 racks, 600 locations), rebuild it with 6 COLD STORAGE racks, 14 PALLETS and the rest PICKING, add packing and a dispatch dock, and validate the geometry.

> Load the master. Give every SKU a location in a rack of its own storage category, put containers over 20 kg on levels 1–2 and tell me what does not fit and why.

> Use the August order lines: reclassify ABC, generate slotting strategies allowing up to 200 moves and heavy items down to level 3, and give me the best one with no weight warnings and its moves. Then show me the route of the top seller.

The agent sizes the space (`facility3d_configure_space`), builds the model with rack categories (`facility3d_apply_model_patch`), validates every container (`warehouse3d_validate_inventory`), loads what fits with pinned low-level locations for heavy items (`warehouse3d_replace_inventory` with `locationId`), works the plan tools and traces the route; the person approves the facility and the plan.

For a full-scale run, [assets/sample-logistics-realistic.xlsx](assets/sample-logistics-realistic.xlsx) holds the same data at 320 SKUs and 20,391 order lines; it needs a 60 × 36 m space (49 racks, 980 locations, 15 COLD STORAGE and 15 PALLETS) and is the scripted scenario in [tests/e2e/realistic-strategy.mjs](tests/e2e/realistic-strategy.mjs). A 20-SKU variant for Chrome's inspector, which takes no attachments, is [tests/e2e/excel-strategy.mjs](tests/e2e/excel-strategy.mjs) with [assets/sample-logistics-messy.xlsx](assets/sample-logistics-messy.xlsx).

**Chrome.** Chrome 150+ with `chrome://flags/#enable-webmcp-testing` enabled, plus the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd) extension (call tools by hand or chat with Gemini using an AI Studio key).

**Without an agent.** Everything the agent can do is also reachable from the UI. The header status reads "WebMCP ready · 32 tools" when the API is present and "WebMCP unavailable" otherwise; the app keeps working either way.

## Run locally

Serve the folder over HTTP (ES modules do not load from `file://`):

```
npx serve .        # or: python -m http.server 8080 (on Windows set .mjs MIME to text/javascript)
```

Then open `http://localhost:3000/` (or the port you chose).

Unit tests (no dependencies):

```
node --test tests/*.test.mjs
```

End-to-end walkthrough (needs Playwright once: `npm i -D playwright && npx playwright install chromium`). It serves the app, injects a stand-in `document.modelContext`, calls the tools the way an agent would, clicks the human-only buttons and saves screenshots to `tests/e2e/shots/`:

```
node tests/e2e/webmcp-walkthrough.mjs
```

## Project layout

```
index.html               Products mode, project hub host, WebMCP logging wrapper and design proxies
facility-designer.html   Design mode (embedded as an iframe)
js/project-hub.js        Project library UI + project tools
js/slotlab-projects.js   Project store (localStorage), import/export
js/slotlab-calculations.mjs  Routing, capacity and layout math
js/product-visuals.mjs   Procedural product cartons for the 3D scene
js/webmcp-validation.mjs JSON Schema validation for tool inputs
css/, assets/, vendor/   Styles, logo and sample CSV, Three.js
tests/                   node:test suites
dist/                    Deployed copy of the app
```

## Built with

Vanilla JavaScript, Three.js, WebMCP (`document.modelContext`). No framework, no server.

## License

MIT — see [LICENSE](LICENSE).
