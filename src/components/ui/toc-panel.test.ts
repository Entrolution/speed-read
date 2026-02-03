import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TocPanel } from './toc-panel';
import type { TocItem } from '@/types';

// Mock ResizeObserver for JSDOM
class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Helper to create TOC items
function createTocItems(count: number, nested = false): TocItem[] {
  const items: TocItem[] = [];
  for (let i = 0; i < count; i++) {
    const item: TocItem = {
      id: `item-${i}`,
      label: `Chapter ${i + 1}`,
      level: 0,
    };
    if (nested && i % 3 === 0) {
      item.children = [
        { id: `item-${i}-1`, label: `Section ${i + 1}.1`, level: 1 },
        { id: `item-${i}-2`, label: `Section ${i + 1}.2`, level: 1 },
      ];
    }
    items.push(item);
  }
  return items;
}

// Wait for Lit to render
async function waitForRender(el: TocPanel): Promise<void> {
  await el.updateComplete;
  await new Promise(resolve => requestAnimationFrame(resolve));
}

describe('TocPanel', () => {
  let panel: TocPanel;

  beforeEach(() => {
    panel = new TocPanel();
    document.body.appendChild(panel);
  });

  afterEach(() => {
    panel.remove();
  });

  describe('standard rendering (< 50 items)', () => {
    it('should render all items in standard mode', async () => {
      panel.items = createTocItems(10);
      panel.open = true;
      await waitForRender(panel);

      const list = panel.shadowRoot?.querySelector('.toc-list');
      const virtualList = panel.shadowRoot?.querySelector('.toc-virtual-list');

      expect(list).not.toBeNull();
      expect(virtualList).toBeNull();
    });

    it('should render nested children', async () => {
      panel.items = createTocItems(10, true);
      panel.open = true;
      await waitForRender(panel);

      const children = panel.shadowRoot?.querySelectorAll('.toc-children');
      expect(children?.length).toBeGreaterThan(0);
    });

    it('should apply level classes', async () => {
      const items: TocItem[] = [
        { id: '1', label: 'Root', level: 0 },
        {
          id: '2', label: 'Root 2', level: 0,
          children: [
            { id: '2-1', label: 'Child', level: 1 },
          ],
        },
      ];
      panel.items = items;
      panel.open = true;
      await waitForRender(panel);

      const level1Btn = panel.shadowRoot?.querySelector('.toc-item-btn--level-1');
      expect(level1Btn).not.toBeNull();
    });

    it('should mark active item', async () => {
      panel.items = createTocItems(5);
      panel.activeId = 'item-2';
      panel.open = true;
      await waitForRender(panel);

      const activeBtn = panel.shadowRoot?.querySelector('.toc-item-btn--active');
      expect(activeBtn?.textContent?.trim()).toBe('Chapter 3');
    });
  });

  describe('virtual scrolling (> 50 items)', () => {
    it('should use virtual scrolling for large lists', async () => {
      panel.items = createTocItems(100);
      panel.open = true;
      await waitForRender(panel);

      const virtualList = panel.shadowRoot?.querySelector('.toc-virtual-list');
      const standardList = panel.shadowRoot?.querySelector('.toc-list');

      expect(virtualList).not.toBeNull();
      expect(standardList).toBeNull();
    });

    it('should render spacer with correct height', async () => {
      panel.items = createTocItems(100);
      panel.open = true;
      await waitForRender(panel);

      const spacer = panel.shadowRoot?.querySelector('.toc-virtual-spacer') as HTMLElement;
      // 100 items * 40px = 4000px
      expect(spacer?.style.height).toBe('4000px');
    });

    it('should position items absolutely', async () => {
      panel.items = createTocItems(100);
      panel.open = true;
      await waitForRender(panel);

      const items = panel.shadowRoot?.querySelectorAll('.toc-virtual-item');
      expect(items?.length).toBeGreaterThan(0);

      const firstItem = items?.[0] as HTMLElement;
      expect(firstItem?.style.top).toBe('0px');
    });

    it('should only render visible items plus buffer', async () => {
      panel.items = createTocItems(200);
      panel.open = true;
      await waitForRender(panel);

      const renderedItems = panel.shadowRoot?.querySelectorAll('.toc-virtual-item');
      // Should render far fewer than 200 items
      expect(renderedItems?.length).toBeLessThan(50);
    });

    it('should flatten nested items for virtual scrolling', async () => {
      // Create nested items that result in > 50 flat items
      const items: TocItem[] = [];
      for (let i = 0; i < 20; i++) {
        items.push({
          id: `chapter-${i}`,
          label: `Chapter ${i + 1}`,
          level: 0,
          children: [
            { id: `section-${i}-1`, label: `Section ${i + 1}.1`, level: 1 },
            { id: `section-${i}-2`, label: `Section ${i + 1}.2`, level: 1 },
          ],
        });
      }
      // 20 chapters + 40 sections = 60 flat items
      panel.items = items;
      panel.open = true;
      await waitForRender(panel);

      const virtualList = panel.shadowRoot?.querySelector('.toc-virtual-list');
      expect(virtualList).not.toBeNull();

      const spacer = panel.shadowRoot?.querySelector('.toc-virtual-spacer') as HTMLElement;
      // 60 items * 40px = 2400px
      expect(spacer?.style.height).toBe('2400px');
    });
  });

  describe('events', () => {
    it('should dispatch toc-select on item click', async () => {
      panel.items = createTocItems(5);
      panel.open = true;
      await waitForRender(panel);

      const selectHandler = vi.fn();
      panel.addEventListener('toc-select', selectHandler);

      const button = panel.shadowRoot?.querySelector('.toc-item-btn') as HTMLButtonElement;
      button?.click();

      expect(selectHandler).toHaveBeenCalled();
      expect(selectHandler.mock.calls[0][0].detail).toEqual(panel.items[0]);
    });

    it('should dispatch close on backdrop click', async () => {
      panel.items = createTocItems(5);
      panel.open = true;
      await waitForRender(panel);

      const closeHandler = vi.fn();
      panel.addEventListener('close', closeHandler);

      const backdrop = panel.shadowRoot?.querySelector('.backdrop') as HTMLElement;
      backdrop?.click();

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should dispatch close on Escape key', async () => {
      panel.items = createTocItems(5);
      panel.open = true;
      await waitForRender(panel);

      const closeHandler = vi.fn();
      panel.addEventListener('close', closeHandler);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should not close on Escape when panel is closed', async () => {
      panel.items = createTocItems(5);
      panel.open = false;
      await waitForRender(panel);

      const closeHandler = vi.fn();
      panel.addEventListener('close', closeHandler);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(closeHandler).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should apply inert when closed', async () => {
      panel.items = createTocItems(5);
      panel.open = false;
      await waitForRender(panel);

      const aside = panel.shadowRoot?.querySelector('.panel');
      expect(aside?.hasAttribute('inert')).toBe(true);
    });

    it('should remove inert when open', async () => {
      panel.items = createTocItems(5);
      panel.open = true;
      await waitForRender(panel);

      const aside = panel.shadowRoot?.querySelector('.panel');
      expect(aside?.hasAttribute('inert')).toBe(false);
    });

    it('should have proper ARIA labels', async () => {
      panel.items = createTocItems(5);
      panel.open = true;
      await waitForRender(panel);

      const aside = panel.shadowRoot?.querySelector('.panel');
      expect(aside?.getAttribute('aria-label')).toBe('Table of contents');

      const closeBtn = panel.shadowRoot?.querySelector('.close-btn');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close table of contents');
    });

    it('should set aria-current on active item', async () => {
      panel.items = createTocItems(5);
      panel.activeId = 'item-1';
      panel.open = true;
      await waitForRender(panel);

      const buttons = panel.shadowRoot?.querySelectorAll('.toc-item-btn');
      const activeBtn = buttons?.[1];
      expect(activeBtn?.getAttribute('aria-current')).toBe('true');
    });
  });

  describe('empty state', () => {
    it('should show empty message when no items', async () => {
      panel.items = [];
      panel.open = true;
      await waitForRender(panel);

      const noToc = panel.shadowRoot?.querySelector('.no-toc');
      expect(noToc?.textContent?.trim()).toBe('No table of contents available');
    });
  });
});
