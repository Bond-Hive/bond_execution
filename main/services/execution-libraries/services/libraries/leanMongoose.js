const insert = async (Model, data) => {
    const instance = new Model(data);
    return await instance.save();
};

const findOne = async (Model, id, projection = {}, options = {}) => {
    return await Model.findOne(id, projection, options).lean();
};

const findWithFilters = async (Model, filters, sort = {}, projection = {}, options = {}) => {
    return await Model.find(filters, projection, options).sort(sort).lean();
};

const findOneByPath = async (Model, id, path, options = {}) => {
    const projection = { [path]: 1 };
    return await Model.findById(id, projection, options).lean();
};

const updateOne = async (Model, id, update, incomingOptions = {}) => {
    const options = { new: true, select: '', ...incomingOptions };
    await Model.findByIdAndUpdate(id, update, options);
    return;
};

const updateDocumentByPath = async (Model, id, path, newValue, incomingOptions = {}) => {
    const options = { new: true, select: '', ...incomingOptions };
    const updateObj = { [path]: newValue };
    await Model.findByIdAndUpdate(id, updateObj, options);
    return;
};

const updateAllElementsInArrayByPath = async (Model, id, path, fieldToUpdate, newValue, incomingOptions = {}) => {
    const options = { new: true, select: '', ...incomingOptions };
    const updateObj = { $set: { [`${path}.$[].${fieldToUpdate}`]: newValue } };
    await Model.findByIdAndUpdate(id, updateObj, options);
    return;
};

const pushValueToArrayByPath = async (Model, id, path, newValue, incomingOptions = {}) => {
    const options = { new: true, select: '', ...incomingOptions };
    const updateObj = { $push: { [path]: newValue } };
    await Model.findByIdAndUpdate(id, updateObj, options);
    return;
};

const getAll = async (Model, projection = {}, options = {}) => {
    return await Model.find({}, projection, options).lean();
};

const deleteOne = async (Model, id, options = {}) => {
    return await Model.findByIdAndDelete(id, options);
};

const deleteByPath = async (Model, id, path, incomingOptions = {}) => {
    const options = { select: '', ...incomingOptions };
    const updateObj = { $unset: { [path]: "" } };
    await Model.findByIdAndUpdate(id, updateObj, options);
    return;
};

const deleteElementFromArrayByPath = async (Model, id, path, index, incomingOptions = {}) => {
    const options = { select: '', ...incomingOptions };
    const pathWithIndex = `${path}.${index}`;
    const unsetUpdate = { $unset: { [pathWithIndex]: 1 } };
    await Model.findByIdAndUpdate(id, unsetUpdate, options);
    const pullUpdate = { $pull: { [path]: null } };
    await Model.findByIdAndUpdate(id, pullUpdate, options);
    return;
};

module.exports = {
    insert,
    findOne,
    updateOne,
    getAll,
    deleteOne,
    findWithFilters,
    updateDocumentByPath,
    pushValueToArrayByPath,
    deleteElementFromArrayByPath,
    deleteByPath,
    findOneByPath,
    updateAllElementsInArrayByPath
};


//////////////// Usage /////////////////////

/*
insert({ price: 100, startQuantity: "50" });

findOne({ _id: "your-id-here" });

updateSubSchema("your-id-here", "mainObjWithGrids", { price: 150 });

findWithFilters({ price: { $gt: 100 } }, { price: -1 });

const id = '64399bcf781d7e9ddf2c9258';
const path = 'stratObj.unhedgedTokens.sell';
const newValue = { "75200": 75201, "75400": 75401 }; // Your new values

updateDocumentByPath(id, path, newValue, (err, result) => {
    if (err) {
        // Handle error
    } else {
        // Handle success
    }
});

updateDocumentByPath(MyModel, '64399bcf781d7e9ddf2c9258', 'stratObj.actionListWithTriggers.2.triggerPrice', newTriggerPrice);
*/
