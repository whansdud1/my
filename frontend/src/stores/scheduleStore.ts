import { defineStore } from 'pinia';
import { scheduleApi, type ScheduleEvent, type CommonSlot, type EventCreate } from '../services/scheduleApi';

// 003-schedule-coordination — T008

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    projectId: '' as string,
    slots: [] as CommonSlot[],
    totalMembers: 0,
    events: [] as ScheduleEvent[],
    loading: false,
  }),
  actions: {
    async load(projectId: string) {
      this.projectId = projectId;
      this.loading = true;
      try {
        const [slots, events] = await Promise.all([
          scheduleApi.commonSlots(projectId),
          scheduleApi.listEvents(projectId),
        ]);
        this.slots = slots.slots;
        this.totalMembers = slots.totalMembers;
        this.events = events;
      } finally {
        this.loading = false;
      }
    },
    async createEvent(body: EventCreate) {
      await scheduleApi.createEvent(this.projectId, body);
      this.events = await scheduleApi.listEvents(this.projectId);
    },
    async cancel(eid: string) {
      await scheduleApi.cancelEvent(eid);
      this.events = await scheduleApi.listEvents(this.projectId);
    },
    async rsvp(eid: string, response: 'ATTEND' | 'DECLINE') {
      await scheduleApi.rsvp(eid, response);
      this.events = await scheduleApi.listEvents(this.projectId);
    },
  },
});
