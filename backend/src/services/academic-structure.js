import {
  AttendanceSession,
  ClassRoom,
  ClassTeacherAssignment,
  Examination,
  Section,
  Student,
  TeacherAssignment,
  Timetable,
} from "../models/domain.models.js";

// Idempotent compatibility migration. Legacy ClassRoom ids are retained for
// audit/history, while operational queries use class (Course) + stream.
export async function ensureSimplifiedAcademicStructure(tenantId) {
  const rooms = await ClassRoom.find({ tenantId }).select("_id courseId departmentId").lean();
  await Promise.all(rooms.flatMap((room) => {
    const structure = { courseId: room.courseId, departmentId: room.departmentId };
    const filter = { tenantId, classId: room._id };
    const missing = { $or: [{ courseId: null }, { departmentId: null }] };
    return [
      Section.updateMany({ ...filter, ...missing }, { $set: structure }),
      ClassTeacherAssignment.updateMany({ ...filter, ...missing }, { $set: structure }),
      Student.updateMany({ ...filter, ...missing }, { $set: structure }),
      TeacherAssignment.updateMany({ ...filter, ...missing }, { $set: structure }),
      Timetable.updateMany({ ...filter, ...missing }, { $set: structure }),
      AttendanceSession.updateMany({ ...filter, ...missing }, { $set: structure }),
      Examination.updateMany({ ...filter, ...missing }, { $set: structure }),
    ];
  }));
}

export async function validateSectionStructure({ tenantId, courseId, departmentId, sectionId }) {
  return Section.exists({
    _id: sectionId,
    tenantId,
    courseId,
    departmentId,
    isActive: { $ne: false },
  });
}
