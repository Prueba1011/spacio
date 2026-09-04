# Spacio

**Warehouse management decisions, made by the person in charge with an AI agent working on the same model through WebMCP.**

Managing a warehouse is a stream of decisions with real consequences: where a new product line goes, which items move closer to dispatch before the season peak, whether the cold area can absorb next month's intake, where twenty incoming pallets will live. Each decision draws on reports from several areas, in several formats, each telling part of the story. The warehouse manager brings them together with experience and takes responsibility for the outcome.

Spacio is a browser app where that work happens. The manager keeps a 3D model of the facility, the inventory that lives in it and the slotting plans under consideration. An AI agent works on that same model through **WebMCP**: it reconciles the reports, validates every product against the physical constraints of the building, turns sales into an ABC classification, proposes slotting strategies and explains each move with numbers. Approval stays with the manager. Approving a facility revision and approving a slotting plan are human checkpoints, and every agent call lands in a traceability log the manager can inspect.

| | |
| --- | --- |
| **Live app** | https://spacio.abel1011.chatgpt.site (open access, runs entirely in the browser) |
| **Source** | https://github.com/Prueba1011/spacio |
| **License** | MIT, see [LICENSE](LICENSE) |
| **WebMCP tools** | 32, registered with `document.modelContext.registerTool()` |
| **Testing** | See [Try it with an agent](#try-it-with-an-agent). Sample data ships in [assets/](assets/). |

## What managing a warehouse actually involves

The job combines tool knowledge with business judgment, applied to information that arrives in pieces.

**Several areas, several reports, one decision.** Logistics keeps the article master with dimensions and storage requirements. Commercial sends the sales export with order lines. Purchasing announces what is coming in and when. Quality flags items on hold. Finance tracks the rented overflow space. Each report serves its own department, so units vary, SKU codes follow different conventions, key columns are partially filled and the operational constraints live in a notes field. Reconciling all of it is the first step of every decision. Today the manager does it with a spreadsheet, and it takes days.

**The rules come from experience.** A 25 kg container belongs on the lower levels. Refrigerated goods belong in cold storage. Fragile items go above heavy ones. The forklift needs 3.6 m to turn and pedestrians need their own path. A share of the locations stays free for peaks. These rules are learned on the floor, from incidents already handled and claims already paid, and a good manager applies them to hundreds of SKUs at once.

**Every decision shows up in the numbers.** A top seller slotted near dispatch saves metres on every pick, every day, for months. Segregated storage areas keep write-offs down. A pallet with a proper location keeps the aisle clear. A layout validated for clearances before installation is built once. Seasonal reslotting, when the recalculation is quick, keeps the layout aligned with demand.

**Someone is accountable.** Once the plan is executed, auditors, insurers and the next shift supervisor ask who decided each move and why. The manager answers with the reasoning that supported the decision.

This dynamic makes warehouse management a natural fit for a person and an agent working together. The reconciliation, the rule checking across hundreds of items and the arithmetic of routes and capacity are where an agent excels. The judgment, the context beyond the reports and the responsibility for the outcome belong to the person.

## How the work is split in Spacio

| The manager | The agent, through WebMCP |
| --- | --- |
| Hands over the reports as they arrive: the article master from logistics, the sales export from commercial | Reconciles them: normalises units, spellings and codes, maps notes such as "keep upright" to constraints, and flags the rows that need a decision from the manager |
| States the operating rules in plain language: heavy items on the two lower levels, cold chain in cold storage, keep the batteries where they are | Validates every container against rack geometry and storage type, pins heavy items low, locks bins, and explains each rejection with a reason code such as `STORAGE_TYPE` or `CONTAINER_TOO_LARGE` |
| Asks for alternatives to compare | Turns order lines into an ABC classification, generates deterministic slotting strategies and compares them by route metres, time, number of moves, free reserve and warnings |
| Questions a proposal: why this move, what happens to the top seller, show me the route | Traces pick routes to packing and dispatch, focuses the camera, reads the frozen move list and the audit trail |
| Adjusts the facility when the data calls for it: more pallet racks, a dispatch dock at the front, a wider aisle | Configures the space, patches racks, zones and docks, generates layout alternatives and validates clearance and reachability |
| Approves the facility revision and approves the plan | Reads the approval state and reports `approvedByHuman` truthfully |

The business rules are encoded in the tools. `facility3d_configure_space` takes the forklift aisle width and whether pedestrians share the circulation. `warehouse3d_validate_inventory` and `warehouse3d_validate_plan` run the same geometric, reachability, reserve and weight-per-level checks the approval button runs, so the agent learns why a proposal fails and comes back with a corrected one before asking the manager. Every plan reports free reserve and can release whole racks for peaks. The Log panel records who did what, human, agent or system, with parameters, results and durations.

## The impact on the operation

Reconciling the reports and loading a validated inventory takes one conversation. Slotting strategies are compared on route metres saved, so the manager sees the effect on picking productivity before moving a single box. Weight and storage-type rules are checked on every SKU, every time, so every rule the manager states is a rule that is enforced. Reslotting can follow the season. When the plan is approved, the move list is frozen with the reasoning attached, so the answer to "who decided this and why" is in the log.

## Why WebMCP fits, and why it fits this hackathon

The reports are unstructured and full of context that a language model reads well. The building is a geometric model that the page reasons about precisely. The decision belongs to a person. WebMCP is the piece that lets those three sit at the same table.

The agent reads the workbook and the manager's intent and turns them into typed tool calls. The page holds the geometry, runs the validation and the optimisation, and returns exact numbers: locations, free reserve, route metres and warnings with codes. The manager keeps the buttons that carry liability: approve a design, approve a plan, apply moves, delete a project.

One agent turn now covers a reconciliation afternoon plus a dozen screens. "Here is the article master, load what fits and tell me what needs a decision." "Reclassify with August sales and give me the strategy that keeps every heavy item on an allowed level." Every step is typed, validated and logged, so the whole exchange can be audited afterwards.

## About the author

I have managed warehouse operations in several sectors, from receiving and slotting through picking, dispatch and inventory audits, and I have spent many afternoons reconciling one department's spreadsheet with another's before making a decision. Every situation described above is one I have dealt with in person. Spacio is the tool I wanted on those days: a model that knows the rules, an assistant that does the reconciliation and the arithmetic, and a clear line around the decisions that stay with the person in charge.

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

The live URL opens directly in a WebMCP-capable browser.

**ChatGPT desktop app.** Latest desktop app, Settings, Browser, Permissions, *Enable site tools*, with model GPT-5.6 Sol or Terra. Open the live URL in the built-in browser and the address bar shows *Site tools* with the 32 tools. Attach the sample workbooks to the chat as usual.

**Chrome 150+.** Enable `chrome://flags/#enable-webmcp-testing`, install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd) extension and open the live URL. The inspector chat works with pasted text, so paste the sheet contents or use the 20-SKU workbook mentioned below.

The header reads "WebMCP ready · 32 tools" when the API is present and "WebMCP unavailable" otherwise. The app keeps working either way, since everything the agent can do is also reachable from the UI.

### Quick start with the built-in sample

> Create a picking warehouse called "Lima North", generate layout alternatives, activate the one with the most locations and tell me if it validates.

> Add a 2.4 × 1.2 m dispatch dock at x 4.3, z −3.3, keeping the four racks of the Balanced layout, and validate the result.

> Load the sample inventory, generate slotting plans with heavy-item level 3 and give me the one with the shortest picking route and a clean validation. Then focus rack R02 and show the outbound route for SKU BRA-100.

### The real scenario: two departments, two reports

The sample data ships the way it reaches a warehouse: one export per department. [assets/sample-master-logistics.xlsx](assets/sample-master-logistics.xlsx) is the article master from logistics, with 200 SKUs across shelving, fragile, refrigerated and pallet storage, sizes in cm, weights in grams or kg, fifteen spellings of four storage types, repeated headers and a notes column carrying real constraints. [assets/sample-sales-august.xlsx](assets/sample-sales-august.xlsx) is the sales export from commercial, with 12,675 August order lines, mixed date formats and a few stray SKUs. CSV twins of both are in the same folder. Then ask, in order:

1. > Create a blank warehouse called Northern Distribution and open it in design mode. Here is our article master (200 SKUs, about 420 rack locations). Configure a 54 × 30 m space with an 8 × 1.6 m rack module, 5 bays, 4 levels and 3.6 m forklift aisles, shared circulation for forklifts and pedestrians. Generate layouts, keep only the balanced one (30 racks, 600 locations), rebuild it with 6 COLD STORAGE racks, 14 PALLETS and the rest PICKING, add packing and a dispatch dock, and validate the geometry.
2. Click **Approve current version** in Design, then open **Products**.
3. > Load the master. Give every SKU a location in a rack of its own storage category, put containers over 20 kg on levels 1 and 2 and tell me which items need a different location and why.
4. > Use the August order lines: reclassify ABC, generate slotting strategies allowing up to 200 moves and heavy items down to level 3, and give me the best one that respects every weight rule, with its moves. Then show me the route of the top seller.
5. Select the recommended plan and click **Approve**.
6. > Read the approval state and give me the frozen move list.

Expected result: a 54 × 30 m facility with 30 racks and 600 locations that validates; all 200 SKUs loaded with free reserve left once the "keep upright" constraint is applied; several slotting strategies, the compact one cutting the picking route by roughly a quarter with every heavy item on an allowed level; and after approval, `approvedByHuman: true` with the frozen move list.

Behind the scenes the agent sizes the space with `facility3d_configure_space`, builds the model with rack categories through `facility3d_apply_model_patch`, validates every container with `warehouse3d_validate_inventory`, loads what fits with pinned low-level locations for heavy items (`warehouse3d_replace_inventory` with `locationId`), works the plan tools and traces the route. The manager approves the facility and the plan.

For a full-scale run, [assets/sample-logistics-realistic.xlsx](assets/sample-logistics-realistic.xlsx) holds the same data at 320 SKUs and 20,391 order lines. It needs a 60 × 36 m space (49 racks, 980 locations, 15 COLD STORAGE and 15 PALLETS), and 20 pallet SKUs are rejected on purpose so the agent has to come back with a proposal for more pallet racks, the way it would in a real intake meeting. A 20-SKU variant for Chrome's inspector is [assets/sample-logistics-messy.xlsx](assets/sample-logistics-messy.xlsx).

## Run locally

Serve the folder over HTTP so the ES modules load:

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

Vanilla JavaScript, Three.js and WebMCP (`document.modelContext`). Plain files served as they are: open the folder over HTTP and it runs. State persists in `localStorage`.

## License

MIT. See [LICENSE](LICENSE).
