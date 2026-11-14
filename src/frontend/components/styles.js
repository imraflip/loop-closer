import { xcss } from '@forge/react';

const border = {
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
};

// Release card on Screen 1: full width of the page.
export const cardStyle = xcss({ width: '100%', padding: 'space.300', backgroundColor: 'elevation.surface.raised', ...border });

// Tab panel content: fill the panel row (docs: display block + flexGrow make `grow` work in flex parents).
export const panelStyle = xcss({ display: 'block', flexGrow: 1, width: '100%', paddingBlock: 'space.200' });

// Stat tile: width 0% + flexGrow 1 makes the three tiles share the row equally.
export const tileStyle = xcss({
  display: 'block', flexGrow: 1, width: '0%', padding: 'space.300', backgroundColor: 'elevation.surface.sunken', ...border,
});

// Screen 2 columns: about 40% / 60% of the row.
export const leftColumnStyle = xcss({ display: 'block', flexGrow: 2, width: '0%' });
export const rightColumnStyle = xcss({ display: 'block', flexGrow: 3, width: '0%', padding: 'space.300', backgroundColor: 'elevation.surface.raised', ...border });

// One customer row in the left column; the selected one is highlighted.
// textAlign left: Pressable is a button, which centers wrapped text by default.
const rowBase = { display: 'block', width: '100%', padding: 'space.150', textAlign: 'left', ...border };
export const rowStyle = xcss({
  ...rowBase,
  backgroundColor: 'elevation.surface',
  ':hover': { backgroundColor: 'elevation.surface.hovered' },
});
export const selectedRowStyle = xcss({
  ...rowBase,
  backgroundColor: 'color.background.selected',
  ':hover': { backgroundColor: 'color.background.selected.hovered' },
});

// "They wrote" / "Fixed in" boxes.
export const quoteStyle = xcss({ display: 'block', flexGrow: 1, width: '0%', padding: 'space.200', backgroundColor: 'elevation.surface.sunken', ...border });
