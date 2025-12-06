declare module 'packery' {
  export interface PackeryOptions {
    itemSelector?: string;
    gutter?: number;
    percentPosition?: boolean;
    columnWidth?: number | string;
  }

  export default class Packery {
    constructor(element: Element, options?: PackeryOptions);
    reloadItems(): void;
    layout(): void;
    destroy(): void;
    getItemElements(): Element[];
    bindDraggabillyEvents(draggie: any): void;
  }
}

declare module 'draggabilly' {
  export interface DraggabillyOptions {
    handle?: string;
  }

  export default class Draggabilly {
    constructor(element: Element, options?: DraggabillyOptions);
    on(eventName: string, listener: (...args: any[]) => void): void;
    off(eventName: string, listener: (...args: any[]) => void): void;
    destroy(): void;
  }
}
