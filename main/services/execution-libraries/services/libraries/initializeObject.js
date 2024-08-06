// Define the objects we will need to update;
// Do remember that using those functions will results in updating also the input obj ( original object ).
// If you need to avoid this it is a common practice to use Object.assign({}, obj) to create a copy of the object.
// Avoid using JSON.parse(JSON.stringify(obj)) as it is not the best practice.

class Bucket {
  constructor(object) {
    this.object = object;
  }
  
  // Function to get the object
  getObject() {
    return this.object;
  }
  
  // Function to replace the value of a property in the object
  replacePropertyValue(property, value) {
    this.object[property] = value;
  }
  
  // Function to replace all property values in the object at once, if the input is not present it will be added at the rigth place.
  replaceAllPropertyValues(values) {
    for (const [property, value] of Object.entries(values)) {
      this.replacePropertyValue(property, value);
    }
  }

  // Function to fully replace the object
  replaceObject(object) {
    this.object = object;
  }
}

module.exports = Bucket;

  