import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisplayController } from './display-controller';

describe('DisplayController', () => {
  let controller: DisplayController;

  beforeEach(() => {
    controller = new DisplayController();
  });

  describe('initialization', () => {
    it('should start with default zoom level of 1.0', () => {
      expect(controller.getZoomLevel()).toBe(1.0);
    });

    it('should start with default fit mode of page', () => {
      expect(controller.getFitMode()).toBe('page');
    });

    it('should start with default layout of 1-page', () => {
      expect(controller.getLayout()).toBe('1-page');
    });
  });

  describe('setZoomLevel', () => {
    it('should set zoom level', () => {
      controller.setZoomLevel(1.5);
      expect(controller.getZoomLevel()).toBe(1.5);
    });

    it('should notify on change', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setZoomLevel(1.5);
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('setFitMode', () => {
    it('should set fit mode', () => {
      controller.setFitMode('width');
      expect(controller.getFitMode()).toBe('width');
    });

    it('should notify on change', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setFitMode('width');
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('setLayout', () => {
    it('should set layout mode', () => {
      controller.setLayout('2-page');
      expect(controller.getLayout()).toBe('2-page');
    });

    it('should notify on change', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setLayout('2-page');
      expect(onChange).toHaveBeenCalled();
    });

    it('should not notify if layout is the same', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setLayout('1-page');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('scroll position persistence', () => {
    it('should save scroll position', () => {
      const container = {
        scrollLeft: 100,
        scrollTop: 200,
      } as HTMLElement;

      controller.saveScrollPosition(1, container);

      const newContainer = {
        scrollLeft: 0,
        scrollTop: 0,
      } as HTMLElement;

      controller.restoreScrollPosition(1, newContainer);

      expect(newContainer.scrollLeft).toBe(100);
      expect(newContainer.scrollTop).toBe(200);
    });

    it('should reset to top-left for new pages', () => {
      const container = {
        scrollLeft: 100,
        scrollTop: 200,
      } as HTMLElement;

      controller.restoreScrollPosition(99, container);

      expect(container.scrollLeft).toBe(0);
      expect(container.scrollTop).toBe(0);
    });

    it('should clear scroll positions', () => {
      const container = {
        scrollLeft: 100,
        scrollTop: 200,
      } as HTMLElement;

      controller.saveScrollPosition(1, container);
      controller.clearScrollPositions();

      const newContainer = {
        scrollLeft: 50,
        scrollTop: 50,
      } as HTMLElement;

      controller.restoreScrollPosition(1, newContainer);

      expect(newContainer.scrollLeft).toBe(0);
      expect(newContainer.scrollTop).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all settings to defaults', () => {
      controller.setZoomLevel(2.0);
      controller.setFitMode('width');
      controller.setLayout('2-page');

      const container = {
        scrollLeft: 100,
        scrollTop: 200,
      } as HTMLElement;
      controller.saveScrollPosition(1, container);

      controller.reset();

      expect(controller.getZoomLevel()).toBe(1.0);
      expect(controller.getFitMode()).toBe('page');
      expect(controller.getLayout()).toBe('1-page');

      // Scroll positions should be cleared
      const newContainer = {
        scrollLeft: 50,
        scrollTop: 50,
      } as HTMLElement;
      controller.restoreScrollPosition(1, newContainer);
      expect(newContainer.scrollLeft).toBe(0);
      expect(newContainer.scrollTop).toBe(0);
    });

    it('should notify on reset', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.reset();
      expect(onChange).toHaveBeenCalled();
    });
  });
});
