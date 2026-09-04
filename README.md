# Spacio

**Warehouse design and slotting in 3D, where the people who run the warehouse and an AI agent plan on the same model.**

Spacio is a browser-only warehouse lab built by someone who has managed warehouses for a living. A person designs a facility (perimeter, racks, aisles, accesses, docks), loads the products that live in it and compares slotting alternatives in a 3D scene. An AI agent works on that same model through **WebMCP**: it reads the facility, generates and validates layouts, cleans and loads inventory, turns sales into an ABC classification, generates slotting plans, traces pick routes and reads the approval state. What the agent can never do is approve. Approving a facility design and approving a slotting plan are human-only checkpoints, and every agent call lands in a traceability log the person can inspect.

| | |
| --- | --- |
| **Live app** | https://spacio.abel1011.chatgpt.site (no login, no backend) |
| **Source** | https://github.com/Prueba1011/spacio |
| **License** | MIT, see [LICENSE](LICENSE) |
| **WebMCP tools** | 32, registered with `document.modelContext.registerTool()` |
| **Testing** | See [Try it with an agent](#try-it-with-an-agent). Sample data ships in [assets/](assets/). |

## The problem, seen from the warehouse floor

Most small and mid-size warehouses are still planned with spreadsheets and a printed floor plan. These are the situations that come up every week, and Spacio was designed around them.

**The article master is never clean.** Logistics keeps one sheet and commercial keeps another. Dimensions come in centimetres, weights in grams or kilos depending on who typed the row, the same storage type is spelled five different ways, and the constraints that really matter ("keep upright", "damaged box, inspect") live in a free-text notes column. Any relocation project starts with an afternoon of data cleaning.

**Products end up where there was space, not where they belong.** A new line arrives, the receiver puts it in the first empty bin, and six months later the top seller sits at the back of the warehouse while a dead SKU occupies the bin next to the dock.

**Heavy boxes on the top level.** A 25 kg container on level 4 is an injury and a damaged product waiting to happen. Everybody knows the rule. Nobody has a tool that checks it across 300 SKUs.

**Storage types get mixed.** Refrigerated goods in ambient racks, pallets forced into shelving, fragile items under heavy ones. Each of these turns into a claim, a write-off or an audit finding.

**The aisle that turned out too narrow.** Racks get placed, and then the forklift cannot turn or a pedestrian route crosses forklift traffic. Fixing it after installation costs more than the racks did.

**Reslotting never happens.** Sales change every season, but recomputing an ABC classification and a move plan by hand takes days, so the warehouse keeps last year's layout.

**"Who moved this, and why?"** Once a plan is executed, the reasons behind each move are lost. Auditors, insurers and the next shift supervisor all ask the same question, and nobody has the answer.

None of these are technical problems. They are business problems that need spatial reasoning, domain rules and someone accountable for the decision. That combination is what Spacio encodes.

## What running a warehouse actually requires

The tools in Spacio are not generic data entry. Each one carries a rule a warehouse manager applies every day.

| Business rule | Where it lives in Spacio |
| --- | --- |
| Rack module, bay count, levels and aisle width follow the handling equipment, not the other way round | `facility3d_configure_space` takes the forklift aisle width and whether pedestrians share the circulation. `facility3d_validate_layout` checks clearance and reachability. |
| Storage types are segregated: pallets in pallet racks, cold chain in cold storage, fragile away from heavy | Rack categories (COLD STORAGE, PALLETS, PICKING) and `warehouse3d_validate_inventory`, which rejects a container with a reason code such as `STORAGE_TYPE` or `CONTAINER_TOO_LARGE`. |
| Heavy containers stay low | Weight-per-level thresholds (`heavyWarningKg`, `heavyMaximumLevel`) in plan generation and validation, plus pinned locations when loading. |
| Fast movers sit close to packing and dispatch | ABC classification from real order lines and distance-based slotting strategies that report the route metres saved. |
| Reserve capacity is kept for peaks | Every plan reports free reserve and can release whole racks. |
| Some things must not move | `warehouse3d_set_bin_lock` freezes a bin so a plan works around it. |
| Changes are approved by a person and are auditable | Approval buttons exist only in the UI. The tools report `approvedByHuman` truthfully, and an approved plan freezes its move list. |
| Every action can be reviewed later | The Log panel records who did what (human, agent or system) with parameters, results and durations. |

## Why WebMCP fits, and why it fits this hackathon

Warehouse planning is a conversation between a spatial model and a human who is accountable for the result. Screen-scraping agents cannot reason about rack geometry, aisle widths or weight-per-level rules by looking at the pixels of a 3D canvas, and a page made of form fields cannot read a messy Excel. WebMCP puts each kind of reasoning where it belongs.

The agent does what it is good at: reading an unstructured workbook, normalising units and spellings, mapping free-text notes to constraints, and turning a plain-language request ("keep the batteries where they are, put anything over 20 kg on the two lower levels") into typed tool calls.

The page does what it is good at: holding the geometry, running the validation rules and the optimisation, and returning exact numbers (locations, free reserve, route metres, warnings with codes) instead of something guessed from a screenshot.

The person keeps the decisions that carry liability: approving a design, approving a plan, applying moves, deleting projects. Those are page buttons only.

One agent turn now replaces a data-cleaning afternoon plus a dozen screens. "Load this workbook." "Reclassify with August sales and give me the best strategy with no weight warnings." The alternative, an agent typing 200 products into a form and reading numbers off a canvas, is slow, error-prone and impossible to audit.

## What people and agents can do together

| Person | Agent (via WebMCP) |
| --- | --- |
| Creates a project or picks a template | Creates, lists, duplicates, archives and exports projects |
| Shapes the space, places racks, sets aisles | Reads the facility, configures space and accesses, patches racks, zones and walls, generates and validates layouts |
| Approves a facility revision (human only) | Reads the approval state and knows whether the active revision is approved |
| Hands over the article master and the sales export as they are | Normalises the workbook, validates every container against rack geometry and storage type, loads what fits and explains what does not |
| Adds constraints in plain language | Locks bins, pins heavy items low, focuses the camera on a rack, traces pick routes to the dock |
| Compares slotting alternatives in 3D | Generates deterministic plans, validates them and compares them by distance, time, moves and warnings |
| Approves a plan and freezes its move list (human only) | Reads the frozen move list and the audit trail |

## About the author

I have managed warehouses in several sectors, from receiving and slotting through picking, dispatch and inventory audits. Every problem listed above is one I have dealt with in person, usually armed with a spreadsheet and a printed floor plan. Spacio is the tool I wanted on those days: a model that knows the rules, an assistant that does the tedious reading and mapping, and a clear line around the decisions that stay with the person in charge.

## WebMCP implementation

Tools are registered imperatively with `document.modelContext.registerTool()`. The page also accepts `navigator.modelContext` for older Chrome builds. Each tool declares a JSON Schema `inputSchema` with bounded numbers and enums, an `annotations.readOnlyHint` flag and an async `execute` that returns plain JSON. Inputs are validated against the schema before execution (see [js/webmcp-validation.mjs](js/webmcp-validation.mjs)), unknown parameters are rejected, and every call is wrapped so its parameters, result, duration and errors land in the in-app Log panel.

The Design mode runs in an iframe. Because agents only see tools registered on the top-level document, the main page registers proxy tools that forward to the designer's API, so all 32 tools are visible from one document.

Where the registration lives: [js/project-hub.js](js/project-hub.js) (project tools), [index.html](index.html) (product tools, logging wrapper and design proxies) and [facility-designer.html](facility-designer.html) (design tools).

### Tool catalog (32 tools)

**Projects (8):** `slotlab_list_warehouses`, `slotlab_create_warehouse`, `slotlab_get_warehouse`, `slotlab_update_warehouse`, `slotlab_open_warehouse`, `slotlab_duplicate_warehouse`, `slotlab_archive_warehouse`, `slotlab_export_warehouse`.

**Design (10):** `facility3d_get_configuration`, `facility3d_configure_space`, `facility3d_configure_accesses`, `facility3d_apply_model_patch` (add, update and remove racks, zones, walls, doors and obstacles, with dry run), `facility3d_generate_layouts`, `facility3d_activate_layout`, `facility3d_validate_layout`, `facility3d_compare_layouts`, `facility3d_clear_layout`, `facility3d_undo_design_change`.

**Products (14):** `warehouse3d_get_snapshot`, `warehouse3d_validate_inventory`, `warehouse3d_replace_inventory`, `warehouse3d_undo_inventory_change`, `warehouse3d_generate_plans`, `warehouse3d_activate_plan`, `warehouse3d_validate_plan`, `warehouse3d_compare_plans`, `warehouse3d_get_move_list`, `warehouse3d_get_approval_state`, `warehouse3d_focus_rack`, `warehouse3d_set_bin_lock`, `warehouse3d_show_product_pick_route`, `warehouse3d_set_product_highlight`.

Open the **WebMCP tools** button in the app header to browse every tool with its schema, or the **Log** button to see what the agent did.

## Try it with an agent

No login is required. Open the live URL in a WebMCP-capable browser.

**ChatGPT desktop app.** Latest desktop app, Settings, Browser, Permissions, *Enable site tools*, with model GPT-5.6 Sol or Terra. Open the live URL in the built-in browser and the address bar shows *Site tools* with the 32 tools. Attach the sample workbooks to the chat as usual.

**Chrome 150+.** Enable `chrome://flags/#enable-webmcp-testing`, install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd) extension and open the live URL. The inspector chat takes no attachments, so paste the sheet contents as text or use the 20-SKU workbook mentioned below.

The header reads "WebMCP ready · 32 tools" when the API is present and "WebMCP unavailable" otherwise. The app keeps working either way, since everything the agent can do is also reachable from the UI.

### Quick start, no spreadsheet

> Create a picking warehouse called "Lima North", generate layout alternatives, activate the one with the most locations and tell me if it validates.

> Add a 2.4 × 1.2 m dispatch dock at x 4.3, z −3.3, keeping the four racks of the Balanced layout, and validate the result.

> Load the sample inventory, generate slotting plans with heavy-item level 3 and give me the one with the shortest picking route and no warnings. Then focus rack R02 and show the outbound route for SKU BRA-100.

### Bring the real spreadsheets

The sample data ships the way it reaches a warehouse: one export per department. [assets/sample-master-logistics.xlsx](assets/sample-master-logistics.xlsx) is the article master from logistics, with 200 SKUs across shelving, fragile, refrigerated and pallet storage, sizes in cm, weights in grams or kg, fifteen spellings of four storage types, repeated headers and a notes column carrying real constraints. [assets/sample-sales-august.xlsx](assets/sample-sales-august.xlsx) is the sales export from commercial, with 12,675 August order lines, mixed date formats and a few stray SKUs. CSV twins of both are in the same folder. Then ask, in order:

1. > Create a blank warehouse called Northern Distribution and open it in design mode. Here is our article master (200 SKUs, about 420 rack locations). Configure a 54 × 30 m space with an 8 × 1.6 m rack module, 5 bays, 4 levels and 3.6 m forklift aisles, shared circulation with no separate pedestrian route. Generate layouts, keep only the balanced one (30 racks, 600 locations), rebuild it with 6 COLD STORAGE racks, 14 PALLETS and the rest PICKING, add packing and a dispatch dock, and validate the geometry.
2. Click **Approve current version** in Design, then open **Products**.
3. > Load the master. Give every SKU a location in a rack of its own storage category, put containers over 20 kg on levels 1 and 2 and tell me what does not fit and why.
4. > Use the August order lines: reclassify ABC, generate slotting strategies allowing up to 200 moves and heavy items down to level 3, and give me the best one with no weight warnings and its moves. Then show me the route of the top seller.
5. Select the recommended plan and click **Approve**.
6. > Read the approval state and give me the frozen move list.

Expected result: a 54 × 30 m facility with 30 racks and 600 locations that validates; all 200 SKUs loaded with free reserve left once the "keep upright" constraint is applied; several slotting strategies, the compact one cutting the picking route by roughly a quarter with zero weight warnings; and after approval, `approvedByHuman: true` with the frozen move list.

Behind the scenes the agent sizes the space with `facility3d_configure_space`, builds the model with rack categories through `facility3d_apply_model_patch`, validates every container with `warehouse3d_validate_inventory`, loads what fits with pinned low-level locations for heavy items (`warehouse3d_replace_inventory` with `locationId`), works the plan tools and traces the route. The person approves the facility and the plan.

For a full-scale run, [assets/sample-logistics-realistic.xlsx](assets/sample-logistics-realistic.xlsx) holds the same data at 320 SKUs and 20,391 order lines. It needs a 60 × 36 m space (49 racks, 980 locations, 15 COLD STORAGE and 15 PALLETS), and 20 pallet SKUs are rejected on purpose so the agent has to propose more pallet racks. A 20-SKU variant for Chrome's inspector is [assets/sample-logistics-messy.xlsx](assets/sample-logistics-messy.xlsx).

## Run locally

Serve the folder over HTTP, because ES modules do not load from `file://`:

```
npx serve .        # or: python -m http.server 8080 (on Windows set .mjs MIME to text/javascript)
```

Then open `http://localhost:3000/` or the port you chose.

## Project layout

```
index.html               Products mode, project hub host, WebMCP logging wrapper and design proxies
facility-designer.html   Design mode (embedded as an iframe)
js/project-hub.js        Project library UI and project tools
js/slotlab-projects.js   Project store (localStorage), import and export
js/slotlab-calculations.mjs  Routing, capacity and layout math
js/product-visuals.mjs   Procedural product cartons for the 3D scene
js/webmcp-validation.mjs JSON Schema validation for tool inputs
css/, assets/, vendor/   Styles, logo and sample workbooks, Three.js
```

## Built with

Vanilla JavaScript, Three.js and WebMCP (`document.modelContext`). No framework, no server, no build step. State persists in `localStorage`.

## License

MIT. See [LICENSE](LICENSE).
