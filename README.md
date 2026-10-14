# Kitchen Studio — Platform Foundation v0.1

Kitchen Studio is being rebuilt as a professional kitchen-design platform rather than a fixed kitchen configurator.

## Foundation included in v0.1

- Blank-project workflow with no fixed room size or predefined kitchen shape
- Free-form straight-wall drawing
- Exact editable wall length, thickness and height
- Arbitrary open, angled and irregular room geometry
- Millimetres as the internal source-of-truth unit
- Display in mm / cm / m / in, with optional secondary inches
- Mixed-unit parsing for technical inputs
- Floor-plan image upload (PNG/JPG/WebP)
- Two-point floor-plan scale calibration
- Editable floor-plan opacity
- Local project save
- JSON import/export
- 2D technical plan canvas
- Live 3D scene generated from the same project geometry
- Render-preview mode and PNG view export
- Catalog foundation for cabinets, appliances and materials
- Standards/technical architecture placeholders for the next implementation layers

## Architectural principle

The parametric project model is the source of truth:

Project model → 2D plan → 3D scene → render → technical calculations.

The renderer must never become an independent model.

## Next implementation layers

1. Parametric cabinet engine
2. Intelligent wall/run snapping and drag/drop cabinet placement
3. Front configurations, carcass/partition rules and internal clear dimensions
4. Manufacturer material and appliance catalog imports
5. BOM, panel calculations, edge banding and cut lists
6. Standards engine and live clearance validation
7. High-quality PBR material pipeline and presentation rendering
8. Dimensioned elevations and PDF technical output

## Deployment

The project remains a static ES-module application and is deployed by the existing Cloudflare Pages project from the `main` branch.
