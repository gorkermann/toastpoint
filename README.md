# toastpoint
JSON with pointers

## description

The code

<code>JSON.stringify( obj )</code>

attempts to turn <code>obj</code> into a JSON string. This doesn't work well if the object contains pointers to other objects, which you *also* want to stringify. At best, space is wasted, and at worst, the conversion fails due to loops in the object tree.

toastpoint converts an array of 'first-class' objects to JSON, except that if one first-class object contains another, that entry is replaced by a 'pointer', which looks thus:

<code>
  {
    "__pointer__": true,
    id: 2
  }
</code>

each first class object contains a unique parameter <code>id</code> which serves as an address. With toastpoint, complex object trees can be saved and reconstructed easily.

## caveats

- Each first-class object must have a unique <code>id</code> parameter
- Each first-class object must have a constructor that can be run with no arguments
- Initialization code for first-class objects that depend on other first class objects may need to be run in a separate <code>init()</code> function
- Objects cannot have parameters named <code>\_\_pointer__</code> or <code>\_\_class__</code>

## flexibility

- any object converted to JSON is checked for <code>toJSON()</code> and <code>fromJSON()</code> methods. If present, these are used instead of the standard full conversion. 
