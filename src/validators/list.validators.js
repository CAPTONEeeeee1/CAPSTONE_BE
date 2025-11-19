const { z } = require('zod');

const createListSchema = z.object({
    boardId: z.string().cuid({ message: 'Định dạng ID bảng không hợp lệ' }),
    name: z.string()
        .min(1, { message: 'Tên list là bắt buộc' })
        .max(100, { message: 'Tên list tối đa 100 ký tự' })
        .trim()
});

const getBoardListsSchema = z.object({
    boardId: z.string().cuid({ message: 'Định dạng ID bảng không hợp lệ' })
});

const updateListSchema = z.object({
    listId: z.string().cuid({ message: 'Định dạng ID list không hợp lệ' }),
    name: z.string()
        .min(1, { message: 'Tên list không được để trống' })
        .max(100, { message: 'Tên list tối đa 100 ký tự' })
        .trim()
        .optional(),
    orderIdx: z.number()
        .int({ message: 'Chỉ số thứ tự phải là số nguyên' })
        .nonnegative({ message: 'Chỉ số thứ tự phải là số không âm' })
        .optional(),
    isDone: z.boolean().optional()
}).refine(data => data.name !== undefined || data.orderIdx !== undefined || data.isDone !== undefined, {
    message: 'Phải cung cấp ít nhất một trường (name, orderIdx hoặc isDone)'
});

const deleteListSchema = z.object({
    listId: z.string().cuid({ message: 'Định dạng ID list không hợp lệ' }),
    moveToListId: z.string().cuid({ message: 'Định dạng ID list đích không hợp lệ' }).optional()
});

const reorderListsSchema = z.object({
    boardId: z.string().cuid({ message: 'Định dạng ID bảng không hợp lệ' }),
    orders: z.array(
        z.object({ 
            id: z.string().cuid({ message: 'Định dạng ID list không hợp lệ' }), 
            orderIdx: z.number()
                .int({ message: 'Chỉ số thứ tự phải là số nguyên' })
                .nonnegative({ message: 'Chỉ số thứ tự phải là số không âm' })
        })
    ).min(1, { message: 'Mảng orders phải chứa ít nhất một phần tử' })
});

module.exports = { 
    createListSchema,
    getBoardListsSchema,
    updateListSchema, 
    deleteListSchema, 
    reorderListsSchema 
};