import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZoomController } from './zoom-controller';

describe('ZoomController', () => {
  let controller: ZoomController;

  beforeEach(() => {
    controller = new ZoomController();
  });

  describe('initialization', () => {
    it('should start with default zoom level of 1.0', () => {
      expect(controller.getLevel()).toBe(1.0);
    });

    it('should start with default fit mode of page', () => {
      expect(controller.getFitMode()).toBe('page');
    });
  });

  describe('setLevel', () => {
    it('should set zoom level', () => {
      controller.setLevel(1.5);
      expect(controller.getLevel()).toBe(1.5);
    });

    it('should clamp zoom level to minimum 0.5', () => {
      controller.setLevel(0.3);
      expect(controller.getLevel()).toBe(0.5);
    });

    it('should clamp zoom level to maximum 3.0', () => {
      controller.setLevel(4.0);
      expect(controller.getLevel()).toBe(3.0);
    });

    it('should switch fit mode to none when setting level', () => {
      controller.setFitMode('width');
      controller.setLevel(1.5);
      expect(controller.getFitMode()).toBe('none');
    });

    it('should not notify if level is the same', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setLevel(1.0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should notify on level change', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setLevel(1.5);
      expect(onChange).toHaveBeenCalledWith(1.5, 'none');
    });
  });

  describe('zoomIn', () => {
    it('should increase zoom level by 5%', () => {
      controller.zoomIn();
      expect(controller.getLevel()).toBeCloseTo(1.05, 5);
    });

    it('should not exceed maximum zoom', () => {
      controller.setLevel(2.98);
      controller.zoomIn();
      expect(controller.getLevel()).toBe(3.0);
    });
  });

  describe('zoomOut', () => {
    it('should decrease zoom level by 5%', () => {
      controller.zoomOut();
      expect(controller.getLevel()).toBeCloseTo(0.95, 5);
    });

    it('should not go below minimum zoom', () => {
      controller.setLevel(0.52);
      controller.zoomOut();
      expect(controller.getLevel()).toBe(0.5);
    });
  });

  describe('reset', () => {
    it('should reset zoom level to 1.0', () => {
      controller.setLevel(2.0);
      controller.reset();
      expect(controller.getLevel()).toBe(1.0);
    });

    it('should reset fit mode to page', () => {
      controller.setFitMode('width');
      controller.reset();
      expect(controller.getFitMode()).toBe('page');
    });
  });

  describe('setFitMode', () => {
    it('should set fit mode', () => {
      controller.setFitMode('width');
      expect(controller.getFitMode()).toBe('width');
    });

    it('should not notify if fit mode is the same', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setFitMode('page');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should notify on fit mode change', () => {
      const onChange = vi.fn();
      controller.setOnChange(onChange);
      controller.setFitMode('width');
      expect(onChange).toHaveBeenCalledWith(1.0, 'width');
    });
  });

  describe('canZoomIn/canZoomOut', () => {
    it('should return true when can zoom in', () => {
      expect(controller.canZoomIn()).toBe(true);
    });

    it('should return false when at max zoom', () => {
      controller.setLevel(3.0);
      expect(controller.canZoomIn()).toBe(false);
    });

    it('should return true when can zoom out', () => {
      expect(controller.canZoomOut()).toBe(true);
    });

    it('should return false when at min zoom', () => {
      controller.setLevel(0.5);
      expect(controller.canZoomOut()).toBe(false);
    });
  });
});
