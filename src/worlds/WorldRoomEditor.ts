/**
 * Copyright (C) 2020 Joseph Petitti
 *
 * This file is part of Artimancer, a simple turn-based RPG for the web.
 *
 * Artimancer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Artimancer is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * Artimancer. If not, see <https://www.gnu.org/licenses/>.
 */

import { Box } from "../Box";
import { CANV_SIZE, DM } from "../DisplayManager";
import { FreeRoamEntity } from "../FreeRoamEntity";
import { IM } from "../InputManager";
import { Polygon } from "../Polygon";
import { RM } from "../ResourceManager";
import { Background, Room } from "../Room";
import { UIElement } from "../UIElement";
import { UM } from "../UIManager";
import { Vector } from "../Vector";
import { WorldFreeRoam } from "./WorldFreeRoam";
import { SpriteUIElement } from "../ui/SpriteUIElement";
import { TextUIElement } from "../ui/TextUIElement";

enum Mode {
  select,
  drawBarrier
}

/**
 * a bare-bones definition of the dimensions and locations of the things needed
 * to make a room
 */
export type roomDefinition = {
  barriers: Polygon[];
  bgObjects: Background[]; // arranged in layers
  entityDefinitions: { label: string; drawBox: Box; altitude: number }[];
};

/**
 * This class is for development purposes, and allows for easy graphical
 * editing of room backgrounds and collision boundaries
 */
export class WorldRoomEditor extends WorldFreeRoam {
  /** all finished bounding polygons */
  private readonly completedPolygons: Polygon[];
  /** the polygon currently being worked on */
  private selectedPolygon: Polygon | undefined;
  /** the currently selected background element */
  private selectedBgObj: Background | undefined;
  /** the currently selected FreeRoamEntity */
  private selectedEntity: FreeRoamEntity | undefined;
  /** current mouse location */
  private mousePos: Vector;
  /** whether the mouse is currently down */
  private mouseIsDown = false;
  /** current editing mode */
  private mode: Mode;
  /** UI elements this world displays */
  private readonly uiElements: UIElement[];
  /** whether or not we're dragging the world camera */
  private dragging = false;

  /**
   * Constructs a new RoomEditor world for a given room
   * @param room the room to edit
   */
  public constructor(room: Room) {
    super();
    this.setType("Room Editor");
    this.setRoom(room);
    this.completedPolygons = new Array<Polygon>();
    this.selectedEntity = undefined;
    this.mode = Mode.drawBarrier;
    this.mousePos = new Vector(0, 0);
    this.uiElements = new Array<UIElement>(5);
  }

  /**
   * cancels any pending operations, such as drawing a polygon, and deselects
   * everything
   */
  public cancel(): void {
    this.selectedPolygon = undefined;
    this.selectedBgObj = undefined;
    this.selectedEntity = undefined;
  }

  /**
   * handles mouse movements over the canvas, updating this.mousePos
   * @param ev the mouse event produced by the mouse movement
   */
  private mousemoveHandler(ev: MouseEvent): void {
    const vec = DM.windowToWorldCoord(new Vector(ev.clientX, ev.clientY)).add(
      this.cameraOffset
    );
    const delta = vec.subtract(this.mousePos);
    if (this.mousePos && this.dragging) {
      this.cameraOffset = this.cameraOffset.subtract(delta);
      return;
    } else if (this.mouseIsDown && this.mousePos && this.mode === Mode.select) {
      // if holding shift, scale whatever is selected
      if (ev.shiftKey) {
        // scale polygons
        // this is pretty wonky, and based on the canvas origin rather than the
        // polygon centroid, but whatever
        if (this.selectedPolygon !== undefined) {
          this.selectedPolygon.scale(vec.divide(this.mousePos));
        }

        // scale bg sprites
        if (this.selectedBgObj !== undefined) {
          const b = this.selectedBgObj.box;
          const x = vec.subtract(b.getCenter()).x > 0 ? delta.x : -delta.x;
          const y = vec.subtract(b.getCenter()).y > 0 ? delta.y : -delta.y;
          b.topLeft = b.topLeft.subtract(x / 2, y / 2);
          b.width += x;
          b.height += y;
          this.selectedBgObj.box = b;
        }

        // scale entities
        if (this.selectedEntity !== undefined) {
          const b = this.selectedEntity.drawBox;
          const x = vec.subtract(b.getCenter()).x > 0 ? delta.x : -delta.x;
          const y = vec.subtract(b.getCenter()).y > 0 ? delta.y : -delta.y;
          b.topLeft = b.topLeft.subtract(x / 2, y / 2);
          b.width += x;
          b.height += y;
          this.selectedEntity.drawBox = b;
        }
      } else {
        // otherwise drag whatever is selected
        // drag polygons
        if (this.selectedPolygon !== undefined) {
          this.selectedPolygon.translate(delta);
        }
        // drag bg sprites
        if (this.selectedBgObj !== undefined) {
          this.selectedBgObj.box.topLeft = this.selectedBgObj.box.topLeft.add(
            delta
          );
        }
        // drag entities
        if (this.selectedEntity !== undefined) {
          const b = this.selectedEntity.drawBox;
          b.topLeft = b.topLeft.add(delta);
        }
      }
    }
    this.mousePos = vec;
  }

  /**
   * remove event listeners and clear buttons
   * @override
   */
  public exit(): void {
    IM.setOnPressed("delete", undefined);
    UM.setCornerUI("top left", undefined);
    UM.setCornerUI("top right", undefined);
    UM.setCornerUI("bottom left", undefined);
    IM.unregisterButton("select-mode");
    IM.unregisterButton("barrier-mode");
    IM.unregisterButton("export");
    IM.setMouseDown(undefined);
    IM.setMouseUp(undefined);
    IM.setMouseMove(undefined);
    IM.suppressContextMenu(false);
  }

  /**
   * Set default button inputs
   */
  public enter(): void {
    const editMoveMenu = new SpriteUIElement(
      "edit-menu-move",
      new Box(new Vector(0, 0), 300, 150)
    );
    editMoveMenu.setSprite(RM.getSprite("edit-menu-move"));
    this.uiElements[0] = editMoveMenu;
    const editMenuBarrier = new SpriteUIElement(
      "edit-menu-barrier",
      new Box(new Vector(0, 0), 300, 150)
    );
    editMenuBarrier.setSprite(RM.getSprite("edit-menu-barrier"));
    this.uiElements[1] = editMenuBarrier;
    const editInstructionsBarrier = new TextUIElement(
      "edit-instructions-barrier",
      new Box(new Vector(0, 0), 300, 150),
      "Shift+click to complete\nTab to cancel"
    );
    editInstructionsBarrier.style = {
      font: "bold 20px Bitter",
      fontFill: "#d2d2d2",
      lineHeight: 25,
      textAlign: "right",
      padding: 5
    };
    this.uiElements[2] = editInstructionsBarrier;
    const editInstructionsMove = new TextUIElement(
      "edit-instructions-move",
      new Box(new Vector(0, 0), 300, 150),
      "Click+drag to move\nShift+drag to scale\nDelete to delete"
    );
    editInstructionsMove.style = {
      font: "bold 20px Bitter",
      fontFill: "#d2d2d2",
      lineHeight: 25,
      textAlign: "right",
      padding: 0
    };
    this.uiElements[3] = editInstructionsMove;
    const editMenuExport = new SpriteUIElement(
      "edit-menu-export",
      new Box(new Vector(0, 0), 150, 150)
    );
    editMenuExport.setSprite(RM.getSprite("edit-menu-export"));
    this.uiElements[4] = editMenuExport;
    UM.setCornerUI("bottom left", this.uiElements[4]);
    this.setMode(Mode.drawBarrier);
    IM.setOnPressed("escape", this.cancel.bind(this));
    IM.registerButton("select-mode", "m");
    IM.setOnPressed("select-mode", () => {
      this.setMode(Mode.select);
    });
    IM.registerButton("barrier-mode", "b");
    IM.setOnPressed("barrier-mode", () => {
      this.setMode(Mode.drawBarrier);
    });
    IM.registerButton("delete", "Delete");
    IM.setOnPressed("delete", this.delete.bind(this));
    IM.registerButton("export", "x");
    IM.setOnPressed("export", () => {
      navigator.clipboard.writeText(this.exportString()).then(() => {
        console.log("WorldRoomEditor: copied to clipboard");
      });
    });
    IM.setMouseDown(this.mousedownHandler.bind(this));
    IM.setMouseUp(this.selectMouseupHandler.bind(this));
    IM.setMouseMove(this.mousemoveHandler.bind(this));
    IM.suppressContextMenu(true);
  }

  /**
   * draw the room normally, then draw collision boundaries on top of it
   * @override
   * @param ctx the canvas context to draw on
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    super.draw(ctx);

    // translate based on camera offset
    ctx.translate(-this.cameraOffset.x, -this.cameraOffset.y);

    // draw completed polygons in blue
    for (const p of this.completedPolygons) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 162, 234, 1)";
      ctx.fillStyle = "rgba(0, 122, 204, 0.4)";
      ctx.setLineDash([0]);
      ctx.beginPath();
      ctx.moveTo(p.getPoints()[0].x, p.getPoints()[0].y);
      p.getPoints().forEach(point => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // draw cross-hair in center
      ctx.strokeStyle = "green";
      ctx.fillStyle = "green";
      ctx.lineWidth = 3;
      const cp = p.getCentroid();
      ctx.beginPath();
      ctx.rect(cp.x - 2, cp.y - 10, 4, 20);
      ctx.rect(cp.x - 10, cp.y - 2, 20, 4);
      ctx.stroke();
      ctx.fill();
    }

    // draw current polygon in red
    if (this.selectedPolygon && this.selectedPolygon.getPoints().length > 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 0, 0, 1)";
      ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
      ctx.beginPath();
      const points = this.selectedPolygon.getPoints();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(point => ctx.lineTo(point.x, point.y));
      if (this.mode === Mode.select) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      // draw line to mouse that also completes the polygon
      if (this.mode === Mode.drawBarrier && this.mousePos) {
        ctx.lineTo(this.mousePos.x, this.mousePos.y);
        ctx.stroke();
        ctx.setLineDash([8, 5]);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // draw red box around selected bg object
    if (this.selectedBgObj !== undefined) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 0, 0, 1)";
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.beginPath();
      this.selectedBgObj.box.drawRect(ctx);
      ctx.stroke();
    }

    // draw red box around selected entity
    if (this.selectedEntity !== undefined) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 0, 0, 1)";
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.beginPath();
      this.selectedEntity.drawBox.drawRect(ctx);
      ctx.stroke();
    }

    // draw a cross-hair at the origin
    ctx.lineWidth = 3;
    ctx.strokeStyle = "yellow";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, CANV_SIZE);
    ctx.stroke();
    ctx.moveTo(0, 0);
    ctx.lineTo(CANV_SIZE, 0);
    ctx.stroke();

    // translate back to origin
    ctx.translate(this.cameraOffset.x, this.cameraOffset.y);
  }

  /**
   * handles a mouse down event according to the mode
   * @param ev Mouse Event generated by the mouse click
   */
  public mousedownHandler(ev: MouseEvent): void {
    this.mouseIsDown = true;
    const vec = DM.windowToWorldCoord(new Vector(ev.clientX, ev.clientY)).add(
      this.cameraOffset
    );
    this.mousePos = vec;

    // if it's a right-click we start dragging
    if (ev.button === 2) {
      this.dragging = true;
      ev.preventDefault();
      return;
    }

    if (this.mode === Mode.drawBarrier) {
      if (this.selectedPolygon === null || this.selectedPolygon === undefined) {
        this.selectedPolygon = new Polygon();
      }
      this.selectedPolygon.addPoints(vec);
      if (ev.shiftKey) {
        // try to close the polygon
        if (this.selectedPolygon.getPoints().length > 2) {
          this.completedPolygons.push(this.selectedPolygon);
          this.selectedPolygon = undefined;
        }
      }
    } else if (this.mode === Mode.select && !ev.shiftKey) {
      this.cancel();

      // did we click on a polygon?
      for (const p of this.completedPolygons) {
        if (p.contains(vec)) {
          this.selectedPolygon = p;
          return;
        }
      }

      if (this.currentRoom !== undefined) {
        // did we click an entity?
        for (const e of this.currentRoom.getEntities()) {
          if (e.drawBox.contains(vec)) {
            this.selectedEntity = e;
            return;
          }
        }

        const bgs = this.currentRoom.getBackgrounds();
        // did we click on a background?
        for (let i = bgs.length - 1; i >= 0; --i) {
          // check from the top down
          if (bgs[i].box.contains(vec)) {
            this.selectedBgObj = bgs[i];
            return;
          }
        }
      }
    }
  }

  /**
   * deletes the currently selected element
   */
  private delete(): void {
    if (this.selectedPolygon) {
      const index = this.completedPolygons.indexOf(this.selectedPolygon);
      if (index > -1) {
        this.completedPolygons.splice(index, 1);
        this.selectedPolygon = undefined;
      }
      return;
    }
    if (this.currentRoom && this.selectedBgObj) {
      const bgs = this.currentRoom.getBackgrounds();
      const index = bgs.indexOf(this.selectedBgObj);
      if (index > -1) {
        bgs.splice(index, 1);
        this.selectedBgObj = undefined;
        return;
      }
    }
    if (this.currentRoom && this.selectedEntity) {
      const index = this.currentRoom.getEntities().indexOf(this.selectedEntity);
      if (index > -1) {
        this.currentRoom.getEntities().splice(index, 1);
        this.selectedEntity = undefined;
      }
    }
  }

  /**
   * handles a mouse up event in select/move mode
   * @param ev the mouse event generated by the mouse release
   */
  public selectMouseupHandler(ev: MouseEvent): void {
    this.mouseIsDown = false;
    this.dragging = false;
    this.mousePos = DM.windowToWorldCoord(
      new Vector(ev.clientX, ev.clientY)
    ).add(this.cameraOffset);
  }

  /**
   * @param newMode the mode to enter
   */
  public setMode(newMode: Mode): void {
    this.mode = newMode;
    // cancel pending operations and deselect everything
    this.cancel();
    // set UI element
    if (this.mode === Mode.drawBarrier) {
      UM.setCornerUI("top left", this.uiElements[1]);
      UM.setCornerUI("top right", this.uiElements[2]);
    } else if (this.mode === Mode.select) {
      UM.setCornerUI("top left", this.uiElements[0]);
      UM.setCornerUI("top right", this.uiElements[3]);
    }
  }

  /**
   * Creates a stringified JSON object of all the entities, background objects,
   * and collision polygons in this room
   */
  public exportString(): string {
    const entityDefinitions =
      this.currentRoom?.getEntities().map(ent => {
        return {
          label: ent.getLabel(),
          drawBox: ent.drawBox,
          altitude: ent.altitude
        };
      }) ?? [];
    const out: roomDefinition = {
      barriers: this.completedPolygons,
      bgObjects: this.currentRoom?.getBackgrounds() ?? [],
      entityDefinitions: entityDefinitions
    };
    return JSON.stringify(out);
  }

  /**
   * @override
   */
  public step(): void {
    const dir = IM.getDirectionalVec("move");
    if (dir !== undefined && this.cameraEntity !== undefined) {
      this.cameraEntity.drawBox.topLeft = this.cameraEntity.drawBox.topLeft.add(
        dir.multiply(4)
      );
    }
  }
}
