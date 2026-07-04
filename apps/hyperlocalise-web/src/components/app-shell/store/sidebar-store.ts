import { makeAutoObservable } from "mobx";

export type SidebarApi = {
  open: boolean;
  openMobile: boolean;
  isMobile: boolean;
  state: "expanded" | "collapsed";
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

export class SidebarStore {
  preferredOpen: boolean | null = null;
  forceCollapsed = false;

  private api: SidebarApi | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  bindSidebarApi(api: SidebarApi) {
    this.api = api;
    this.sync();
  }

  unbindSidebarApi() {
    this.api = null;
  }

  get isBound() {
    return this.api !== null;
  }

  get isOpen() {
    return this.api?.open ?? true;
  }

  get isMobile() {
    return this.api?.isMobile ?? false;
  }

  get state(): "expanded" | "collapsed" {
    return this.api?.state ?? "expanded";
  }

  setPreferredOpen(open: boolean | null) {
    this.preferredOpen = open;
    this.sync();
  }

  setForceCollapsed(force: boolean) {
    this.forceCollapsed = force;
    this.sync();
  }

  setOpen(open: boolean) {
    if (!this.api) {
      this.preferredOpen = open;
      return;
    }

    if (this.api.isMobile) {
      this.api.setOpenMobile(open);
      return;
    }

    this.api.setOpen(open);
  }

  toggle() {
    this.api?.toggleSidebar();
  }

  collapse() {
    this.setOpen(false);
  }

  expand() {
    this.setOpen(true);
  }

  sync() {
    if (!this.api) {
      return;
    }

    if (this.forceCollapsed) {
      if (this.api.isMobile) {
        this.api.setOpenMobile(false);
      } else {
        this.api.setOpen(false);
      }
      return;
    }

    if (this.preferredOpen !== null) {
      if (this.api.isMobile) {
        this.api.setOpenMobile(this.preferredOpen);
      } else {
        this.api.setOpen(this.preferredOpen);
      }
    }
  }
}
